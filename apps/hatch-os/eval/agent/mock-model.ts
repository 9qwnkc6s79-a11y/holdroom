/**
 * Deterministic stand-in for the firm model, used by the offline eval.
 *
 * It is the SAME for every arm, and it is deliberately simple: it answers only
 * from data actually present in its prompt, picks the most query-relevant
 * sentences, and when it has nothing but titles it does what real models do
 * when starved of context: lists titles and asks which one. So offline scores
 * measure what each pipeline put in front of the model (retrieval, reading,
 * routing, context), not writing quality. Live mode measures the real model.
 */
import type { ChatTurn, ToolCallLike } from "../../src/lib/harness/engine.ts";

const STOP = new Set("a an the and or for of on in at to from with by about is are was were be do does did i me my we us our you your it this that what whats when where who how get up speed catch any news tell me lmk pls please can could would should stuff deal w just new".split(" "));

function content(q: string) {
  return q.toLowerCase().replace(/[^a-z0-9$,.\s-]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));
}

function dataPortion(messages: ChatTurn[]): { blocks: { title: string; text: string; url?: string }[]; titlesOnly: string[] } {
  const all = messages.map((m) => m.content).join("\n\n");
  const blocks: { title: string; text: string; url?: string }[] = [];
  const titlesOnly: string[] = [];
  // Harness evidence blocks: "[n] Email thread: Title (date)\nbody"
  const re = /\[(\d+)\] (?:Email thread|File|Calendar|Library|Memory): ([^\n]+)\n([\s\S]*?)(?=\n\[\d+\] |\n\n[A-Z][^\n]{0,60}:\n|\n\nNow write|\n\nTools you can call|\n\nNever use|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(all))) {
    const urlMatch = m[2].match(/ — link: (https?:\/\/\S+)/);
    const title = m[2].replace(/ — title only, body not read$/, "").replace(/ — link: https?:\/\/\S+/, "");
    if (/title only/.test(m[2]) || m[3].trim().length < 60) titlesOnly.push(title);
    else blocks.push({ title, text: m[3], url: urlMatch?.[1] });
  }
  // Baseline-style tool results: "- email_search: ok — Gmail: A · B"
  for (const line of all.split("\n")) {
    const g = line.match(/(?:Gmail|Outlook): (.+)$/);
    if (g) titlesOnly.push(...g[1].split(" · "));
  }
  // Baseline full-content block (deep connectors on main).
  const full = all.match(/Full thread text:\n([\s\S]*?)(?=\nContinue\.|$)/);
  if (full) blocks.push({ title: (full[1].match(/Subject: ([^\n]+)/) || [])[1] || "email", text: full[1] });
  return { blocks, titlesOnly: [...new Set(titlesOnly)] };
}

export function mockModel(input: { messages: ChatTurn[]; toolsAvailable: boolean; protocol: "text" | "native" | "none" }): { text: string; toolCalls: ToolCallLike[] } {
  const users = input.messages.filter((m) => m.role === "user");
  const original = users.find((m) => !m.content.startsWith("Tool results")) ? [...users].reverse().find((m) => !m.content.startsWith("Tool results"))!.content : "";
  const alreadyCalled = input.messages.some((m) => /Tool results/.test(m.content));
  const system = input.messages[0]?.content || "";
  const { blocks, titlesOnly } = dataPortion(input.messages);
  const terms = content(original);

  if (/^remember\b/i.test(original)) return { text: "Got it, noted.", toolCalls: [] };

  const sentences: { s: string; title: string; url?: string; score: number }[] = [];
  for (const block of blocks) {
    // Split into messages so the newest message can get a small recency bonus (same rule for every arm).
    const messages = block.text.split(/\n(?=From:)/);
    const dates = messages.map((msg) => (msg.match(/^Date:\s*(\S+)/m) || [])[1] || "");
    const newest = [...dates].sort().pop() || "";
    const titleHit = terms.some((t) => block.title.toLowerCase().includes(t.replace(/s$/, "")));
    messages.forEach((msg, mi) => {
      const parts = msg
        .split(/\n/)
        .filter((l) => !/^(From|To|Date|Attachments|Subject):/i.test(l))
        .join(" ")
        .split(/(?<=[.!?])\s+|\s(?=\d\)\s)|(?=\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2})/);
      for (const s of parts) {
        const clean = s.trim();
        if (clean.split(/\s+/).length < 4) continue;
        const lower = clean.toLowerCase();
        let score = terms.filter((t) => lower.includes(t.replace(/s$/, ""))).length * 2;
        // Status cues: money, dates, needs, approvals. Same weights for every arm.
        score += Math.min(2, [/\$\d/, /\b(nov|dec|jan|friday|thursday|monday)\b/i, /\b(need|needs|waiting|approv|deposit|due|by )/i].filter((re) => re.test(clean)).length);
        if (/^\s*\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(clean)) score += 2; // calendar line
        if (titleHit) score += 1;
        if (newest && dates[mi] === newest && messages.length > 1) score += 1;
        sentences.push({ s: clean, title: block.title, url: block.url, score });
      }
    });
  }
  const good = sentences.filter((x) => x.score >= 2).sort((a, b) => b.score - a.score).slice(0, 5);

  const looksChat = /haiku|poem|joke|\d+%\s*of\s*\d|\d+\s*(?:plus|minus|times)\s*\d|^lol\b|^hey thanks|rule of thumb/i.test(original);
  if (!good.length && input.toolsAvailable && !alreadyCalled && !looksChat && input.protocol !== "none") {
    const name = /calendar|tmrw|tomorrow|meeting|schedule/i.test(original) ? "calendar_list" : /\b(pdf|file|doc|docs|drive|spreadsheet)\b/i.test(original) ? "cloud_files_search" : "email_search";
    const call = { name, arguments: { query: terms.filter((t) => !/^(pdf|file|calendar|tmrw)$/.test(t)).slice(0, 5).join(" ") } };
    return input.protocol === "text"
      ? { text: `<tool_call>${JSON.stringify(call)}</tool_call>`, toolCalls: [call] }
      : { text: "", toolCalls: [call] };
  }
  if (looksChat) {
    if (/haiku/i.test(original)) return { text: "Cold brew, slow and dark —\nnight steeps into morning light,\nice rings in the glass.", toolCalls: [] };
    const m = original.match(/(\d+(?:\.\d+)?)%\s*of\s*([\d,]+)/);
    if (m) return { text: `${((Number(m[1]) / 100) * Number(m[2].replace(/,/g, ""))).toLocaleString("en-US")}`, toolCalls: [] };
    const mp = original.match(/(\d+)\s*plus\s*(\d+)/i);
    if (mp) return { text: `${Number(mp[1]) + Number(mp[2])}`, toolCalls: [] };
    if (/^lol\b/i.test(original)) return { text: "That looks like internet slang, not a firm project.", toolCalls: [] };
    if (/thanks/i.test(original)) return { text: "You're welcome!", toolCalls: [] };
    if (/rule of thumb/i.test(original)) return { text: "Aim for about 25–30 seconds for a 1:2 espresso shot.", toolCalls: [] };
  }
  if (!good.length) {
    if (titlesOnly.length) return { text: `I found some emails that might be related: ${titlesOnly.slice(0, 4).join("; ")}. Could you clarify which one you'd like me to look at?`, toolCalls: [] };
    return { text: "I couldn't find anything about that in the connected email, files, or library.", toolCalls: [] };
  }
  const draft = /Answer shape:[^\n]*(?:email_draft|ready-to-send draft)/i.test(system) || /^draft\b/i.test(original);
  const isBrief = /What this ask looks like: status brief/i.test(system);
  const lines = good.map((g) => g.s);
  const seenCite = new Map<string, string | undefined>();
  for (const g of good) if (!seenCite.has(g.title)) seenCite.set(g.title, g.url);
  const cite = [...seenCite.entries()].slice(0, 2).map(([t, u]) => (u ? `[${t}](${u})` : `"${t}"`)).join(", ");
  if (draft) return { text: `Draft reply (not sent):\nSubject: Re: ${good[0].title}\n\nHi Rick,\nApproved on proof v3. ${lines.slice(0, 2).join(" ")}\n\nThanks,\nDaniel\n\n(based on ${cite})`, toolCalls: [] };
  if (isBrief) return { text: `Bottom line: ${lines[0]}\n${lines.slice(1).map((l) => `- ${l}`).join("\n")}\n(from ${cite})`, toolCalls: [] };
  return { text: `${lines[0]}${lines.length > 1 ? `\n${lines.slice(1).map((l) => `- ${l}`).join("\n")}` : ""}\n(from ${cite})`, toolCalls: [] };
}
