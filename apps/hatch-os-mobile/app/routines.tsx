import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, KeyboardAvoidingView, Modal, Platform, RefreshControl, ScrollView, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { advanceRoutines, deleteRoutine, listRoutines, markRoutinesRead, postApproval, runRoutine, saveRoutine, setRoutineEnabled } from "@/api/client";
import type { Routine, RoutineRun, RoutinesPayload } from "@/api/types";
import { EmptyNote, Screen, Switch, T } from "@/components/chrome";
import { IconClose } from "@/components/icons";
import { PressableScale } from "@/components/PressableScale";
import { useRequireSession, useSession } from "@/state/session";
import { colors, type } from "@/theme/presenceTokens";

type Draft = {
  id?: string;
  name: string;
  prompt: string;
  mode: Routine["mode"];
  trigger: "schedule" | "email";
  when: string;
  triggerQuery: string;
};

const EMPTY: Draft = { name: "", prompt: "", mode: "agent", trigger: "schedule", when: "weekdays at 7am", triggerQuery: "" };

function short(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });
}

function plain(text: string) {
  return text.replace(/\*\*(.+?)\*\*/g, "$1").replace(/^#+\s*/gm, "").trim();
}

function runLabel(run: RoutineRun) {
  if (run.status === "running") return "Working…";
  if (run.status === "needs_approval" && run.approval?.status === "pending") return "Needs your approval";
  if (run.status === "failed") return "Didn’t finish";
  if (run.status === "skipped") return "Skipped";
  return run.reason === "email" ? "New email" : "Done";
}

function Chip({ label, tone }: { label: string; tone?: "blue" | "dim" }) {
  return (
    <View style={{ borderRadius: 99, borderWidth: 1, borderColor: tone === "blue" ? colors.blueEdge : colors.line, backgroundColor: tone === "blue" ? colors.blueEdge : colors.surfaceRaised, paddingHorizontal: 8, paddingVertical: 2 }}>
      <T style={[type.timestamp, { color: tone === "blue" ? colors.blueSoft : tone === "dim" ? colors.dim : colors.muted }]}>{label}</T>
    </View>
  );
}

function SmallButton({ label, onPress, primary, danger, disabled }: { label: string; onPress: () => void; primary?: boolean; danger?: boolean; disabled?: boolean }) {
  return (
    <PressableScale accessibilityRole="button" accessibilityLabel={label} onPress={onPress} disabled={disabled} style={{ height: 36, paddingHorizontal: 14, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: primary ? colors.blueButton : colors.surfaceButton, borderWidth: primary ? 0 : 1, borderColor: colors.lineStrong, opacity: disabled ? 0.6 : 1 }}>
      <T style={[type.metaLabel, { color: primary ? colors.white : danger ? "#F87171" : colors.fg, fontWeight: "600" }]}>{label}</T>
    </PressableScale>
  );
}

function Segment({ options, value, onChange }: { options: { value: string; label: string; hint: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
      {options.map((o) => (
        <PressableScale key={o.value} accessibilityRole="button" accessibilityLabel={o.label} accessibilityState={{ selected: value === o.value }} onPress={() => onChange(o.value)} style={{ flex: 1, borderRadius: 12, borderWidth: 1, borderColor: value === o.value ? colors.blueButton : colors.lineInput, backgroundColor: value === o.value ? colors.blueEdge : colors.surfaceInput, paddingHorizontal: 11, paddingVertical: 9 }}>
          <T style={[type.metaLabel, { color: colors.fg, fontWeight: "600" }]}>{o.label}</T>
          <T style={[type.timestamp, { color: colors.muted, marginTop: 2 }]}>{o.hint}</T>
        </PressableScale>
      ))}
    </View>
  );
}

function Field({ label, value, onChangeText, placeholder, multiline, hint }: { label: string; value: string; onChangeText: (v: string) => void; placeholder?: string; multiline?: boolean; hint?: string }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <T style={[type.metaLabel, { color: colors.muted }]}>{label}</T>
      <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.dim} multiline={multiline} accessibilityLabel={label} autoCapitalize="sentences"
        style={[type.inputText, { color: colors.fg, marginTop: 6, borderWidth: 1, borderColor: colors.lineInput, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: colors.surfaceInput, minHeight: multiline ? 88 : undefined, textAlignVertical: multiline ? "top" : "center" }]} />
      {hint ? <T style={[type.timestamp, { color: colors.dim, marginTop: 5 }]}>{hint}</T> : null}
    </View>
  );
}

export default function RoutinesScreen() {
  useRequireSession();
  const router = useRouter();
  const { session } = useSession();
  const [data, setData] = useState<RoutinesPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [formError, setFormError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await listRoutines());
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load routines.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Poll while a model run is in flight (the server advances it).
  useEffect(() => {
    if (!data?.running) return;
    const timer = setTimeout(() => {
      void advanceRoutines().then(setData).catch(() => undefined);
    }, 5000);
    return () => clearTimeout(timer);
  }, [data]);

  const results = useMemo(
    () =>
      (data?.routines || [])
        .flatMap((routine) => (routine.runs || []).map((run) => ({ run, routine })))
        .filter(({ run }) => run.text || run.status === "running")
        .sort((a, b) => (a.run.startedAt < b.run.startedAt ? 1 : -1))
        .slice(0, 10),
    [data],
  );

  async function act(id: string, fn: () => Promise<unknown>) {
    setBusy(id);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy("");
    }
  }

  function runNow(routine: Routine) {
    const go = () => act(routine.id, async () => setData(await runRoutine(routine.id)));
    if (!routine.usesModel) return void go();
    Alert.alert("Run it now?", "This uses the firm model. If it’s asleep, the first answer can take 2–5 minutes.", [
      { text: "Cancel", style: "cancel" },
      { text: "Run", onPress: () => void go() },
    ]);
  }

  function remove(routine: Routine) {
    Alert.alert(`Delete “${routine.name}”?`, "Past results stay in its thread.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => void act(routine.id, async () => { await deleteRoutine(routine.id); await load(); }) },
    ]);
  }

  function decide(run: RoutineRun, decision: "approved" | "cancelled") {
    if (!run.threadId || !run.messageId || !session) return;
    void act(run.id, async () => {
      await postApproval({ threadId: run.threadId!, messageId: run.messageId!, decision, actor: `${session.role} · ${session.deviceName}`, accessibleDepartments: session.departments || [], enterprise: Boolean(session.enterprise), testerCode: session.inviteCode || "staff" });
      await load();
    });
  }

  function edit(routine?: Routine) {
    setFormError("");
    if (!routine) return setDraft({ ...EMPTY });
    setDraft({
      id: routine.id,
      name: routine.name,
      prompt: routine.prompt,
      mode: routine.mode,
      trigger: routine.trigger ? "email" : "schedule",
      when: routine.trigger ? "weekdays at 7am" : routine.schedule.replace(/\s+(CT|ET|MT|PT|MST|UTC)$/, ""),
      triggerQuery: routine.trigger?.query || "",
    });
  }

  async function save() {
    if (!draft) return;
    setFormError("");
    const original = data?.routines.find((r) => r.id === draft.id);
    const body: Parameters<typeof saveRoutine>[0] = { id: draft.id, name: draft.name, prompt: draft.prompt, mode: draft.trigger === "schedule" && draft.mode === "notify" ? "agent" : draft.mode };
    if (draft.trigger === "email") {
      body.triggerQuery = draft.triggerQuery;
      body.cron = "";
    } else if (!original || original.trigger || draft.when.trim() !== original.schedule.replace(/\s+(CT|ET|MT|PT|MST|UTC)$/, "")) {
      body.when = draft.when;
    }
    try {
      await saveRoutine(body);
      setDraft(null);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not save that routine.");
    }
  }

  const routines = data?.routines || [];

  return (
    <Screen bottom={false}>
      <View style={{ paddingHorizontal: 8, flexDirection: "row", alignItems: "center" }}>
        <PressableScale accessibilityRole="button" accessibilityLabel="Close routines" onPress={() => (router.canGoBack() ? router.back() : router.replace("/bots"))} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
          <IconClose size={18} color={colors.fg} />
        </PressableScale>
        <T style={[type.headerBrand, { color: colors.fg, flex: 1 }]}>Routines</T>
        <View style={{ paddingRight: 8 }}>
          <SmallButton label="New" primary onPress={() => edit()} />
        </View>
      </View>
      <ScrollView refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor={colors.fg} />} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}>
        <T style={[type.cardSubcopy, { color: colors.muted, marginTop: 4, marginBottom: 6 }]}>
          Saved asks that run on a schedule or when an email arrives. Anything that sends or changes something waits for you. You can also just say “remind me every Monday to…” in chat.
        </T>
        {error ? <T style={[type.cardSubcopy, { color: "#F87171", marginBottom: 8 }]}>{error}</T> : null}

        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 14, marginBottom: 8 }}>
          <T style={[type.metaLabel, { color: colors.muted, flex: 1 }]}>RESULTS{data?.unread ? ` · ${data.unread} NEW` : ""}</T>
          {data?.unread ? (
            <PressableScale accessibilityRole="button" accessibilityLabel="Mark all read" onPress={() => void markRoutinesRead().then(setData)}>
              <T style={[type.metaLabel, { color: colors.blueSoft }]}>Mark all read</T>
            </PressableScale>
          ) : null}
        </View>
        {results.length ? (
          <View style={{ backgroundColor: colors.surface, borderRadius: 16, overflow: "hidden" }}>
            {results.map(({ run, routine }, index) => (
              <PressableScale key={run.id} accessibilityRole="button" accessibilityLabel={`${routine.name} result`} onPress={() => (!run.read && run.status !== "running" ? void markRoutinesRead({ id: routine.id, runId: run.id }).then(setData) : undefined)}
                style={{ paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: index === results.length - 1 ? 0 : 1, borderBottomColor: colors.line }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: !run.read && run.status !== "running" ? colors.blueSky : "transparent" }} />
                  <T style={[type.rowTitle, { color: colors.fg, flexShrink: 1 }]} numberOfLines={1}>{routine.name}</T>
                  <T style={[type.timestamp, { color: colors.dim }]}>{short(run.finishedAt || run.startedAt)} · {runLabel(run)}</T>
                </View>
                {run.status === "running" ? (
                  <T style={[type.cardSubcopy, { color: colors.muted, marginTop: 6 }]}>The firm model is working on it. If it was asleep this can take 2–5 minutes.</T>
                ) : run.text ? (
                  <T style={[type.cardSubcopy, { color: colors.fgBody, marginTop: 6 }]} numberOfLines={8}>{plain(run.text)}</T>
                ) : null}
                {run.approval?.status === "pending" ? (
                  <View style={{ marginTop: 10, flexDirection: "row", gap: 8, alignItems: "center" }}>
                    <T style={[type.metaLabel, { color: colors.amberSoft, flex: 1 }]} numberOfLines={1}>{run.approval.title}</T>
                    <SmallButton label="Deny" disabled={busy === run.id} onPress={() => decide(run, "cancelled")} />
                    <SmallButton label="Approve" primary disabled={busy === run.id} onPress={() => decide(run, "approved")} />
                  </View>
                ) : null}
              </PressableScale>
            ))}
          </View>
        ) : (
          <EmptyNote title="No results yet" body="When a routine runs, what it found shows up here." />
        )}

        <T style={[type.metaLabel, { color: colors.muted, marginTop: 22, marginBottom: 8 }]}>YOUR ROUTINES{routines.length ? ` (${routines.length})` : ""}</T>
        {routines.length ? (
          <View style={{ backgroundColor: colors.surface, borderRadius: 16, overflow: "hidden" }}>
            {routines.map((routine, index) => (
              <View key={routine.id} style={{ paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: index === routines.length - 1 ? 0 : 1, borderBottomColor: colors.line }}>
                <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <T style={[type.rowTitle, { color: colors.fg }]}>{routine.name}</T>
                    <T style={[type.cardSubcopy, { color: colors.muted, marginTop: 2 }]}>{routine.schedule}</T>
                    <T style={[type.timestamp, { color: colors.dim, marginTop: 4 }]} numberOfLines={2}>{routine.prompt}</T>
                  </View>
                  <Switch value={routine.enabled} label={routine.enabled ? `Pause ${routine.name}` : `Resume ${routine.name}`} onValueChange={(enabled) => void act(routine.id, async () => { await setRoutineEnabled(routine.id, enabled); await load(); })} />
                </View>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                  <Chip label={routine.usesModel ? "Firm model" : routine.mode === "reminder" ? "Reminder · no model" : "Email alert · no model"} tone={routine.usesModel ? "blue" : undefined} />
                  {!routine.enabled ? <Chip label="Paused" tone="dim" /> : null}
                  {routine.enabled && routine.nextRunAt ? <Chip label={`Next ${short(routine.nextRunAt)}`} /> : null}
                </View>
                <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                  <SmallButton label="Run now" disabled={busy === routine.id} onPress={() => runNow(routine)} />
                  <SmallButton label="Edit" onPress={() => edit(routine)} />
                  <SmallButton label="Delete" danger disabled={busy === routine.id} onPress={() => remove(routine)} />
                </View>
              </View>
            ))}
          </View>
        ) : (
          <EmptyNote title="No routines yet" body="Tap New, or tell Hatch in chat: “every weekday at 7am brief me on open vendor threads.”" />
        )}
        {data?.limits ? (
          <T style={[type.timestamp, { color: colors.dim, marginTop: 12 }]}>
            Runs at most every {data.limits.minIntervalMinutes} minutes. Up to {data.limits.dailyModelRuns} firm-model runs a day. Reminders and email alerts don’t use the model.
          </T>
        ) : null}
      </ScrollView>

      <Modal visible={Boolean(draft)} transparent animationType="slide" onRequestClose={() => setDraft(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" }}>
          <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "92%" }}>
            <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingTop: 8 }}>
              <PressableScale accessibilityRole="button" accessibilityLabel="Close" onPress={() => setDraft(null)} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
                <IconClose size={18} color={colors.fg} />
              </PressableScale>
              <T style={[type.headerBrand, { color: colors.fg, flex: 1, textAlign: "center" }]}>{draft?.id ? "Edit routine" : "New routine"}</T>
              <View style={{ paddingRight: 8 }}>
                <SmallButton label="Save" primary onPress={() => void save()} />
              </View>
            </View>
            {draft ? (
              <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
                <Field label="Name" value={draft.name} onChangeText={(name) => setDraft({ ...draft, name })} placeholder="Morning vendor brief" />
                <Field label="What should Hatch do?" value={draft.prompt} multiline onChangeText={(prompt) => setDraft({ ...draft, prompt })} placeholder="Brief me on open vendor threads: who is waiting on whom." />
                <View style={{ marginBottom: 14 }}>
                  <T style={[type.metaLabel, { color: colors.muted }]}>Runs</T>
                  <Segment value={draft.trigger} onChange={(v) => setDraft({ ...draft, trigger: v as Draft["trigger"], mode: v === "email" && draft.mode === "reminder" ? "notify" : v === "schedule" && draft.mode === "notify" ? "agent" : draft.mode })}
                    options={[{ value: "schedule", label: "On a schedule", hint: "Weekdays, Mondays…" }, { value: "email", label: "When email arrives", hint: "Checked every 15 min" }]} />
                </View>
                {draft.trigger === "schedule" ? (
                  <Field label="When" value={draft.when} onChangeText={(when) => setDraft({ ...draft, when })} placeholder="weekdays at 7am" hint="Plain English: “every Monday at 9”, “tomorrow at 3pm”, “every 2 hours”." />
                ) : (
                  <Field label="Email to watch for" value={draft.triggerQuery} onChangeText={(triggerQuery) => setDraft({ ...draft, triggerQuery })} placeholder='from:robert "monument sign"' hint="Gmail search. Only new mail counts." />
                )}
                <View style={{ marginBottom: 14 }}>
                  <T style={[type.metaLabel, { color: colors.muted }]}>What happens</T>
                  <Segment value={draft.mode} onChange={(v) => setDraft({ ...draft, mode: v as Draft["mode"] })}
                    options={[{ value: "agent", label: "Hatch works on it", hint: "Uses the firm model" }, draft.trigger === "schedule" ? { value: "reminder", label: "Just remind me", hint: "No model" } : { value: "notify", label: "Just tell me", hint: "No model" }]} />
                </View>
                {formError ? <T style={[type.cardSubcopy, { color: "#F87171" }]}>{formError}</T> : null}
              </ScrollView>
            ) : null}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </Screen>
  );
}
