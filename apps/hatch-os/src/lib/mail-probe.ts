import net from "node:net";
import tls from "node:tls";

export interface MailAccount {
  email: string;
  password: string;
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
}

function quoteImap(value: string) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function openSocket(host: string, port: number, secure: boolean) {
  return new Promise<net.Socket>((resolve, reject) => {
    const socket = secure
      ? tls.connect({ host, port, servername: host, timeout: 8000 })
      : net.connect({ host, port, timeout: 8000 });
    const fail = (err: Error) => {
      socket.destroy();
      reject(err);
    };
    socket.once("error", fail);
    socket.setTimeout(8000, () => fail(new Error(`Timed out connecting to ${host}:${port}`)));
    socket.once(secure ? "secureConnect" : "connect", () => {
      socket.off("error", fail);
      resolve(socket);
    });
  });
}

function readLines(socket: net.Socket, until: (line: string, all: string) => boolean) {
  return new Promise<string>((resolve, reject) => {
    let buf = "";
    const onData = (chunk: Buffer) => {
      buf += chunk.toString("utf8");
      const lines = buf.split(/\r?\n/).filter(Boolean);
      const last = lines[lines.length - 1] || "";
      if (until(last, buf)) {
        socket.off("data", onData);
        resolve(buf);
      }
    };
    socket.on("data", onData);
    socket.once("error", reject);
  });
}

async function startTls(socket: net.Socket, host: string) {
  return new Promise<tls.TLSSocket>((resolve, reject) => {
    const secure = tls.connect({ socket, servername: host });
    secure.once("secureConnect", () => resolve(secure));
    secure.once("error", reject);
  });
}

export async function checkImap(account: MailAccount): Promise<string> {
  const secure = account.imapPort !== 143;
  const socket = await openSocket(account.imapHost, account.imapPort, secure);
  try {
    const greet = await readLines(socket, (line) => line.startsWith("*"));
    if (!/\* OK/i.test(greet)) throw new Error("The mail server did not send an IMAP greeting.");
    socket.write(`A1 LOGIN ${quoteImap(account.email)} ${quoteImap(account.password)}\r\n`);
    const login = await readLines(socket, (line) => /^A1 /i.test(line));
    if (!/^A1 OK/im.test(login)) throw new Error("IMAP rejected that address or password.");
    socket.write("A2 LOGOUT\r\n");
    return `IMAP login succeeded at ${account.imapHost}.`;
  } finally {
    socket.destroy();
  }
}

export async function checkSmtp(account: MailAccount): Promise<string> {
  const implicit = account.smtpPort === 465;
  let socket = await openSocket(account.smtpHost, account.smtpPort, implicit);
  try {
    const greet = await readLines(socket, (line) => line.startsWith("220"));
    if (!greet.startsWith("220")) throw new Error("The mail server did not send an SMTP greeting.");
    socket.write(`EHLO hatch\r\n`);
    await readLines(socket, (line) => /^250[ -]/.test(line) && !line.startsWith("250-"));
    if (!implicit) {
      socket.write("STARTTLS\r\n");
      const ready = await readLines(socket, (line) => line.startsWith("220"));
      if (!ready.startsWith("220")) throw new Error("SMTP would not start TLS.");
      socket = await startTls(socket, account.smtpHost);
      socket.write("EHLO hatch\r\n");
      await readLines(socket, (line) => /^250[ -]/.test(line) && !line.startsWith("250-"));
    }
    const token = Buffer.from(`\u0000${account.email}\u0000${account.password}`).toString("base64");
    socket.write(`AUTH PLAIN ${token}\r\n`);
    const auth = await readLines(socket, (line) => /^\d{3} /.test(line));
    if (!auth.startsWith("235")) throw new Error("SMTP rejected that address or password.");
    socket.write("QUIT\r\n");
    return `SMTP login succeeded at ${account.smtpHost}.`;
  } finally {
    socket.destroy();
  }
}

export async function imapSearch(account: MailAccount, query: string) {
  const socket = await openSocket(account.imapHost, account.imapPort, account.imapPort !== 143);
  try {
    await readLines(socket, (line) => line.startsWith("*"));
    socket.write(`A1 LOGIN ${quoteImap(account.email)} ${quoteImap(account.password)}\r\n`);
    const login = await readLines(socket, (line) => /^A1 /i.test(line));
    if (!/^A1 OK/im.test(login)) throw new Error("IMAP login failed.");
    socket.write("A2 SELECT INBOX\r\n");
    await readLines(socket, (line) => /^A2 /i.test(line));
    const term = query.replace(/[^\w\s@.-]/g, " ").trim().slice(0, 80) || "ALL";
    socket.write(term === "ALL" ? "A3 SEARCH ALL\r\n" : `A3 SEARCH TEXT ${quoteImap(term)}\r\n`);
    const found = await readLines(socket, (line) => /^A3 /i.test(line));
    const ids = (found.match(/\* SEARCH[^\r\n]*/)?.[0] || "").split(/\s+/).filter((part) => /^\d+$/.test(part)).slice(-5);
    if (!ids.length) return "No matching messages in Inbox.";
    socket.write(`A4 FETCH ${ids.join(",")} (BODY.PEEK[HEADER.FIELDS (FROM SUBJECT DATE)])\r\n`);
    const headers = await readLines(socket, (line) => /^A4 /i.test(line));
    socket.write("A5 LOGOUT\r\n");
    return headers.replace(/\r/g, "").slice(0, 4000);
  } finally {
    socket.destroy();
  }
}

export async function smtpSend(account: MailAccount, message: { to: string; subject: string; body: string }) {
  const implicit = account.smtpPort === 465;
  let socket = await openSocket(account.smtpHost, account.smtpPort, implicit);
  const command = async (line: string, ok: RegExp) => {
    socket.write(`${line}\r\n`);
    const reply = await readLines(socket, (row) => /^\d{3} /.test(row));
    if (!ok.test(reply)) throw new Error(`SMTP refused the send (${reply.slice(0, 80)}).`);
  };
  try {
    await readLines(socket, (line) => line.startsWith("220"));
    await command("EHLO hatch", /^250/);
    if (!implicit) {
      await command("STARTTLS", /^220/);
      socket = await startTls(socket, account.smtpHost);
      await command("EHLO hatch", /^250/);
    }
    const token = Buffer.from(`\u0000${account.email}\u0000${account.password}`).toString("base64");
    await command(`AUTH PLAIN ${token}`, /^235/);
    await command(`MAIL FROM:<${account.email}>`, /^250/);
    await command(`RCPT TO:<${message.to}>`, /^250/);
    await command("DATA", /^354/);
    const data = [
      `From: ${account.email}`,
      `To: ${message.to}`,
      `Subject: ${message.subject}`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=utf-8",
      "",
      message.body.replace(/^\./gm, ".."),
      ".",
    ].join("\r\n");
    await command(data, /^250/);
    socket.write("QUIT\r\n");
    return `Sent to ${message.to}.`;
  } finally {
    socket.destroy();
  }
}
