import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Text,
  View,
  TextInput,
  ScrollView,
  StyleSheet,
  Alert,
  Switch,
  Platform,
  Modal,
  ActivityIndicator,
  Pressable,
  Linking,
} from "react-native";
import { useRouter } from "expo-router";
import Constants from "expo-constants";

import { ScreenContainer } from "@/components/screen-container";
import { Toast } from "@/components/toast";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useMail } from "@/lib/mail-context";
import {
  describeConnectionError,
  type ConnectionTestStage,
} from "@/lib/connection-diagnostics";
import {
  adminLogin as verifyAdminLogin,
  fetchSettings as fetchWorkerSettings,
  type WorkerProfile,
} from "@/lib/api";
import { useThemeContext, type ThemePreference } from "@/lib/theme-provider";
import * as Haptics from "expo-haptics";

const REFRESH_OPTIONS = [
  { label: "10 sec", value: 10 },
  { label: "30 sec", value: 30 },
  { label: "60 sec", value: 60 },
  { label: "2 min", value: 120 },
  { label: "5 min", value: 300 },
  { label: "Off", value: 0 },
];

const THEME_OPTIONS: { label: string; value: ThemePreference }[] = [
  { label: "System", value: "system" },
  { label: "Light", value: "light" },
  { label: "Dark", value: "dark" },
  { label: "OLED black", value: "oled" },
];

const PRIVACY_POLICY_URL = String(
  Constants.expoConfig?.extra?.privacyPolicyUrl ||
    "https://github.com/Lur1N77777/CloudMail/blob/main/docs/PRIVACY.md"
);
const TERMS_OF_SERVICE_URL = String(
  Constants.expoConfig?.extra?.termsOfServiceUrl ||
    "https://github.com/Lur1N77777/CloudMail/blob/main/docs/TERMS.md"
);

function getThemeLabel(scheme: ThemePreference) {
  if (scheme === "system") return "system";
  if (scheme === "oled") return "OLED black";
  return scheme === "dark" ? "dark" : "light";
}

function createDraftWorkerProfile(index = 1): WorkerProfile {
  return {
    id: `draft_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: `Account ${index}`,
    workerUrl: "",
    frontendUrl: "",
    adminPassword: "",
    sitePassword: "",
    domains: [],
    domainLabels: [],
    defaultDomains: [],
    randomSubdomainDomains: [],
    status: "unchecked",
  };
}

function normalizeDraftWorkerProfile(profile: WorkerProfile): WorkerProfile {
  return {
    ...profile,
    name: profile.name.trim() || "Unnamed account",
    workerUrl: profile.workerUrl.trim().replace(/\/+$/, ""),
    frontendUrl: (profile.frontendUrl || "").trim().replace(/\/+$/, ""),
    adminPassword: profile.adminPassword.trim(),
    sitePassword: (profile.sitePassword || "").trim(),
    domains: Array.isArray(profile.domains) ? profile.domains : [],
    domainLabels: Array.isArray(profile.domainLabels) ? profile.domainLabels : [],
    defaultDomains: Array.isArray(profile.defaultDomains) ? profile.defaultDomains : [],
    randomSubdomainDomains: Array.isArray(profile.randomSubdomainDomains)
      ? profile.randomSubdomainDomains
      : [],
  };
}

function getWorkerProfileTestFingerprint(profile: WorkerProfile) {
  const normalized = normalizeDraftWorkerProfile(profile);
  return [
    normalized.workerUrl,
    normalized.adminPassword,
    normalized.sitePassword || "",
  ].join("\n");
}

export default function SettingsScreen() {
  const colors = useColors();
  const router = useRouter();
  const { colorScheme, themePreference, setThemePreference } = useThemeContext();
  const appVersion = Constants.expoConfig?.version ?? "1.0.1";
  const {
    state,
    saveWorkerProfilesAndEnterAdminLocally,
    loadUserSettings,
    changePassword,
    saveAutoReply,
    enterAdminModeLocally,
    clearError,
    clearSuccess,
    activeAccount,
  } = useMail();

  const [workerProfiles, setWorkerProfiles] = useState<WorkerProfile[]>(() =>
    state.workerProfiles.length > 0
      ? state.workerProfiles
      : [createDraftWorkerProfile(1)]
  );
  const workerProfilesRef = useRef(workerProfiles);
  const [activeWorkerProfileId, setActiveWorkerProfileId] = useState(
    state.activeWorkerProfileId || workerProfiles[0]?.id || ""
  );
  const [refreshInterval, setRefreshInterval] = useState(state.refreshInterval);
  const [isSaving, setIsSaving] = useState(false);
  const [testingProfileId, setTestingProfileId] = useState<string | null>(null);
  const [showRawResponse, setShowRawResponse] = useState(false);

  // Password change
  const [showPasswordSection, setShowPasswordSection] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [oldPassword, setOldPassword] = useState("");
  const [isChangingPwd, setIsChangingPwd] = useState(false);

  // Auto reply
  const [showAutoReplySection, setShowAutoReplySection] = useState(false);
  const [arEnabled, setArEnabled] = useState(false);
  const [arSubject, setArSubject] = useState("");
  const [arName, setArName] = useState("");
  const [arSourcePrefix, setArSourcePrefix] = useState("");
  const [arMessage, setArMessage] = useState("");
  const [isSavingAr, setIsSavingAr] = useState(false);

  // Admin entry
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [adminPwdInput, setAdminPwdInput] = useState("");
  const [isEnteringAdmin, setIsEnteringAdmin] = useState(false);
  const tapCountRef = useRef(0);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    workerProfilesRef.current = workerProfiles;
  }, [workerProfiles]);

  const handleLogoTap = useCallback(() => {
    tapCountRef.current += 1;
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
    tapTimerRef.current = setTimeout(() => {
      tapCountRef.current = 0;
    }, 1500);
    if (tapCountRef.current >= 5) {
      tapCountRef.current = 0;
      setAdminPwdInput(state.adminPassword || "");
      setShowAdminModal(true);
    }
  }, [state.adminPassword]);

  const handleOpenLegalDocument = useCallback(async (url: string, title: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert("Could not open link", `Please try again later or see ${title} in the project repository`);
    }
  }, []);

  const handleEnterAdmin = useCallback(async () => {
    if (!adminPwdInput.trim()) {
      Alert.alert("Notice", "Enter the admin password");
      return;
    }
    setIsEnteringAdmin(true);
    try {
      await enterAdminModeLocally(adminPwdInput);
      setShowAdminModal(false);
      setAdminPwdInput("");
      router.replace("/admin");
    } catch {
      // error already in toast
    } finally {
      setIsEnteringAdmin(false);
    }
  }, [adminPwdInput, enterAdminModeLocally, router]);

  useEffect(() => {
    if (!state.adminPassword && !showAdminModal) return;
    (router as any).prefetch?.("/admin");
  }, [router, showAdminModal, state.adminPassword]);

  useEffect(() => {
    if (state.isInitialized) {
      const nextProfiles =
        state.workerProfiles.length > 0
          ? state.workerProfiles
          : state.workerUrl
            ? [
                {
                  ...createDraftWorkerProfile(1),
                  id: "legacy_default",
                  name: "Default account",
                  workerUrl: state.workerUrl,
                  adminPassword: state.adminPassword,
                  sitePassword: state.sitePassword,
                },
              ]
            : [createDraftWorkerProfile(1)];
      setWorkerProfiles(nextProfiles);
      setActiveWorkerProfileId(
        state.activeWorkerProfileId || nextProfiles[0]?.id || ""
      );
      setRefreshInterval(state.refreshInterval);
    }
  }, [
    state.isInitialized,
    state.workerProfiles,
    state.activeWorkerProfileId,
    state.workerUrl,
    state.adminPassword,
    state.sitePassword,
    state.refreshInterval,
  ]);

  // Sync auto-reply form with user settings
  useEffect(() => {
    const ar = state.userSettings?.auto_reply;
    if (ar) {
      setArEnabled(!!ar.enabled);
      setArSubject(ar.subject || "");
      setArName(ar.name || "");
      setArSourcePrefix(ar.source_prefix || "");
      setArMessage(ar.message || "");
    }
  }, [state.userSettings?.auto_reply]);

  const updateWorkerProfileDraft = useCallback(
    (profileId: string, patch: Partial<WorkerProfile>) => {
      setWorkerProfiles((prev) =>
        prev.map((profile) =>
          profile.id === profileId ? { ...profile, ...patch } : profile
        )
      );
    },
    []
  );

  const handleAddWorkerProfile = useCallback(() => {
    setWorkerProfiles((prev) => {
      const next = [...prev, createDraftWorkerProfile(prev.length + 1)];
      if (!activeWorkerProfileId) {
        setActiveWorkerProfileId(next[0].id);
      }
      return next;
    });
  }, [activeWorkerProfileId]);

  const handleDeleteWorkerProfile = useCallback(
    (profileId: string) => {
      if (workerProfiles.length <= 1) {
        Alert.alert("Notice", "At least one Worker configuration is required");
        return;
      }
      const profile = workerProfiles.find((item) => item.id === profileId);
      Alert.alert("Delete Worker", `Delete the "${profile?.name || "this account"}" configuration?`, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            setWorkerProfiles((prev) => {
              const next = prev.filter((item) => item.id !== profileId);
              if (activeWorkerProfileId === profileId) {
                setActiveWorkerProfileId(next[0]?.id || "");
              }
              return next;
            });
          },
        },
      ]);
    },
    [activeWorkerProfileId, workerProfiles]
  );

  const handleSave = useCallback(async () => {
    const cleanedProfiles = workerProfiles
      .map(normalizeDraftWorkerProfile)
      .filter((profile) => profile.workerUrl || profile.adminPassword || profile.sitePassword);

    if (cleanedProfiles.length === 0) {
      Alert.alert("Notice", "Configure at least one Worker");
      return;
    }

    for (const profile of cleanedProfiles) {
      if (!profile.workerUrl) {
        Alert.alert("Notice", `Enter the Worker URL for "${profile.name}"`);
        return;
      }
      if (!profile.adminPassword) {
        Alert.alert("Notice", `Enter the admin password for "${profile.name}"`);
        return;
      }
    }

    const urlSet = new Set<string>();
    for (const profile of cleanedProfiles) {
      const key = profile.workerUrl.toLowerCase();
      if (urlSet.has(key)) {
        Alert.alert("Notice", `Duplicate Worker URL: ${profile.workerUrl}`);
        return;
      }
      urlSet.add(key);
    }

    const nextActiveId =
      cleanedProfiles.find((profile) => profile.id === activeWorkerProfileId)?.id ||
      cleanedProfiles[0].id;
    setIsSaving(true);
    try {
      saveWorkerProfilesAndEnterAdminLocally(cleanedProfiles, nextActiveId, refreshInterval);
      setIsSaving(false);
      if (Platform.OS !== "web") {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      setTimeout(() => {
        router.replace("/admin");
      }, 0);
    } catch {
      setIsSaving(false);
      // error already in toast
    }
  }, [
    activeWorkerProfileId,
    refreshInterval,
    workerProfiles,
    saveWorkerProfilesAndEnterAdminLocally,
    router,
  ]);

  const handleTestConnection = useCallback(async (profileId: string) => {
    const profile = workerProfiles.find((item) => item.id === profileId);
    if (!profile) return;
    const draft = normalizeDraftWorkerProfile(profile);
    const testFingerprint = getWorkerProfileTestFingerprint(draft);
    if (!draft.workerUrl) {
      Alert.alert("Notice", "Enter the Worker URL first");
      return;
    }
    if (!draft.adminPassword) {
      Alert.alert("Notice", "Enter the admin password first");
      return;
    }
    setTestingProfileId(profileId);
    let testStage: ConnectionTestStage = "settings";
    try {
      const configOverride = {
        workerUrl: draft.workerUrl,
        adminPassword: draft.adminPassword,
        sitePassword: draft.sitePassword || "",
        lang: "en",
      };
      const settings = await fetchWorkerSettings({ configOverride });
      testStage = "admin";
      await verifyAdminLogin(draft.adminPassword, { configOverride });
      const domainCount = settings.domains?.length || 0;
      const checkedProfile: Partial<WorkerProfile> = {
        domains: settings.domains || [],
        domainLabels: settings.domainLabels || [],
        defaultDomains: settings.defaultDomains || [],
        randomSubdomainDomains: settings.randomSubdomainDomains || [],
        status: "connected",
        lastCheckedAt: new Date().toISOString(),
        errorMessage: undefined,
      };
      const latest = workerProfilesRef.current.find((item) => item.id === profileId);
      if (!latest || getWorkerProfileTestFingerprint(latest) !== testFingerprint) {
        return;
      }
      updateWorkerProfileDraft(profileId, checkedProfile);
      if (domainCount > 0) {
        Alert.alert(
          "Connected",
          `"${draft.name}" found ${domainCount} usable domains:\n${settings.domains?.join(", ")}`
        );
      } else {
        Alert.alert(
          "Connected, but no domains",
          `"${draft.name}" responded normally, but domains is empty.\n\nCheck this Worker's DOMAINS environment variable.`
        );
      }
    } catch (err: any) {
      const latest = workerProfilesRef.current.find((item) => item.id === profileId);
      if (!latest || getWorkerProfileTestFingerprint(latest) !== testFingerprint) {
        return;
      }
      const diagnostic = describeConnectionError(err, testStage);
      updateWorkerProfileDraft(profileId, {
        status: "error",
        lastCheckedAt: new Date().toISOString(),
        errorMessage: `${diagnostic.title}: ${diagnostic.message}`,
      });
      Alert.alert(
        diagnostic.title,
        `${diagnostic.message}\n\n${diagnostic.suggestion}`
      );
    } finally {
      setTestingProfileId(null);
    }
  }, [updateWorkerProfileDraft, workerProfiles]);

  const handleReturnAdmin = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/admin");
  }, [router]);
  const handleChangePassword = useCallback(async () => {
    if (!newPassword.trim()) {
      Alert.alert("Notice", "Enter a new password");
      return;
    }
    setIsChangingPwd(true);
    try {
      await changePassword(newPassword, oldPassword || undefined);
      setNewPassword("");
      setOldPassword("");
    } catch {}
    setIsChangingPwd(false);
  }, [newPassword, oldPassword, changePassword]);

  const handleSaveAutoReply = useCallback(async () => {
    setIsSavingAr(true);
    try {
      await saveAutoReply({
        enabled: arEnabled,
        subject: arSubject.trim(),
        name: arName.trim(),
        source_prefix: arSourcePrefix.trim(),
        message: arMessage,
      });
    } catch {}
    setIsSavingAr(false);
  }, [arEnabled, arSubject, arName, arSourcePrefix, arMessage, saveAutoReply]);

  const rawResponseText = state.settings?._raw
    ? JSON.stringify(state.settings._raw, null, 2)
    : "(Not fetched)";

  return (
    <ScreenContainer>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>
          Admin settings
        </Text>

        {/* Server Config Section */}
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionTitle, styles.sectionTitleInline, { color: colors.muted }]}>
            Workers
          </Text>
          <Pressable
            onPress={handleAddWorkerProfile}
            style={({ pressed }) => [
              styles.smallPillButton,
              {
                backgroundColor: `${colors.primary}12`,
                borderColor: `${colors.primary}28`,
                opacity: pressed ? 0.75 : 1,
              },
            ]}
          >
            <IconSymbol name="plus.circle.fill" size={14} color={colors.primary} />
            <Text style={[styles.smallPillButtonText, { color: colors.primary }]}>Add Worker</Text>
          </Pressable>
        </View>

        {workerProfiles.map((profile, index) => {
          const isActive = activeWorkerProfileId === profile.id;
          const isTesting = testingProfileId === profile.id;
          const domainText = profile.domains?.length
            ? profile.domains.join(", ")
            : profile.status === "connected"
              ? "No domains found"
              : "Domains not refreshed yet";
          const statusColor =
            profile.status === "connected"
              ? colors.success
              : profile.status === "error"
                ? colors.error
                : colors.muted;
          const statusLabel =
            profile.status === "connected"
              ? "Connected"
              : profile.status === "error"
                ? "Connection failed"
                : "Not tested";

          return (
            <View
              key={profile.id}
              style={[
                styles.card,
                styles.workerProfileCard,
                {
                  backgroundColor: colors.surface,
                  borderColor: isActive ? colors.primary : colors.border,
                },
              ]}
            >
              <View style={styles.workerProfileHeader}>
                <View style={styles.workerProfileTitleWrap}>
                  <Text style={[styles.workerProfileTitle, { color: colors.foreground }]}>
                    {profile.name?.trim() || `Account ${index + 1}`}
                  </Text>
                  <Text style={[styles.workerProfileStatus, { color: statusColor }]}>
                    {isActive ? "Current · " : ""}{statusLabel}
                  </Text>
                </View>
                <View style={styles.workerProfileActions}>
                  {!isActive ? (
                    <Pressable
                      onPress={() => setActiveWorkerProfileId(profile.id)}
                      style={({ pressed }) => [
                        styles.workerTinyButton,
                        {
                          borderColor: colors.primary,
                          opacity: pressed ? 0.7 : 1,
                        },
                      ]}
                    >
                      <Text style={[styles.workerTinyButtonText, { color: colors.primary }]}>Make current</Text>
                    </Pressable>
                  ) : null}
                  <Pressable
                    onPress={() => handleDeleteWorkerProfile(profile.id)}
                    disabled={workerProfiles.length <= 1}
                    style={({ pressed }) => [
                      styles.workerIconButton,
                      {
                        borderColor: colors.border,
                        opacity: workerProfiles.length <= 1 ? 0.35 : pressed ? 0.65 : 1,
                      },
                    ]}
                  >
                    <IconSymbol name="trash.fill" size={14} color={colors.error} />
                  </Pressable>
                </View>
              </View>

              <View style={[styles.fieldGroup, { borderBottomColor: colors.border }]}>
                <View style={styles.fieldHeader}>
                  <IconSymbol name="person.crop.circle.fill" size={18} color={colors.primary} />
                  <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Account name</Text>
                </View>
                <TextInput
                  style={[
                    styles.fieldInput,
                    {
                      color: colors.foreground,
                      borderColor: colors.border,
                      backgroundColor: colors.background,
                      opacity: isTesting ? 0.62 : 1,
                    },
                  ]}
                  value={profile.name}
                  editable={!isTesting}
                  onChangeText={(text) => updateWorkerProfileDraft(profile.id, { name: text })}
                  placeholder="e.g. Cloudflare account A"
                  placeholderTextColor={colors.muted}
                />
              </View>

              <View style={[styles.fieldGroup, { borderBottomColor: colors.border }]}>
                <View style={styles.fieldHeader}>
                  <IconSymbol name="globe" size={18} color={colors.primary} />
                  <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Worker URL</Text>
                </View>
                <TextInput
                  style={[
                    styles.fieldInput,
                    {
                      color: colors.foreground,
                      borderColor: colors.border,
                      backgroundColor: colors.background,
                      opacity: isTesting ? 0.62 : 1,
                    },
                  ]}
                  value={profile.workerUrl}
                  editable={!isTesting}
                  onChangeText={(text) => updateWorkerProfileDraft(profile.id, { workerUrl: text, status: "unchecked" })}
                  placeholder="https://your-worker.example.com"
                  placeholderTextColor={colors.muted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                />
              </View>

              <View style={[styles.fieldGroup, { borderBottomColor: colors.border }]}>
                <View style={styles.fieldHeader}>
                  <IconSymbol name="key.fill" size={18} color={colors.primary} />
                  <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Admin password</Text>
                </View>
                <TextInput
                  style={[
                    styles.fieldInput,
                    {
                      color: colors.foreground,
                      borderColor: colors.border,
                      backgroundColor: colors.background,
                      opacity: isTesting ? 0.62 : 1,
                    },
                  ]}
                  value={profile.adminPassword}
                  editable={!isTesting}
                  onChangeText={(text) => updateWorkerProfileDraft(profile.id, { adminPassword: text, status: "unchecked" })}
                  placeholder="Admin password (required)"
                  placeholderTextColor={colors.muted}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              <View style={[styles.fieldGroup, { borderBottomColor: colors.border }]}>
                <View style={styles.fieldHeader}>
                  <IconSymbol name="safari" size={18} color={colors.primary} />
                  <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Frontend URL</Text>
                </View>
                <TextInput
                  style={[
                    styles.fieldInput,
                    {
                      color: colors.foreground,
                      borderColor: colors.border,
                      backgroundColor: colors.background,
                      opacity: isTesting ? 0.62 : 1,
                    },
                  ]}
                  value={profile.frontendUrl || ""}
                  editable={!isTesting}
                  onChangeText={(text) => updateWorkerProfileDraft(profile.id, { frontendUrl: text })}
                  placeholder="https://your-pages.pages.dev (optional)"
                  placeholderTextColor={colors.muted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                />
                <Text style={[styles.fieldHint, { color: colors.muted }]}>
                  URL of the web mailbox UI, used to generate one-tap sign-in links
                </Text>
              </View>

              <View style={[styles.fieldGroup, { borderBottomColor: colors.border }]}>
                <View style={styles.fieldHeader}>
                  <IconSymbol name="lock.fill" size={18} color={colors.primary} />
                  <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Site password</Text>
                </View>
                <TextInput
                  style={[
                    styles.fieldInput,
                    {
                      color: colors.foreground,
                      borderColor: colors.border,
                      backgroundColor: colors.background,
                      opacity: isTesting ? 0.62 : 1,
                    },
                  ]}
                  value={profile.sitePassword || ""}
                  editable={!isTesting}
                  onChangeText={(text) => updateWorkerProfileDraft(profile.id, { sitePassword: text, status: "unchecked" })}
                  placeholder="Site access password (optional)"
                  placeholderTextColor={colors.muted}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              <View style={styles.workerDomainBox}>
                <Text style={[styles.fieldHint, { color: colors.muted }]} numberOfLines={3}>
                  Domains: {domainText}
                </Text>
                {profile.errorMessage ? (
                  <Text style={[styles.fieldHint, { color: colors.error }]} numberOfLines={2}>
                    {profile.errorMessage}
                  </Text>
                ) : null}
                <Pressable
                  onPress={() => handleTestConnection(profile.id)}
                  disabled={isTesting}
                  style={({ pressed }) => [
                    styles.workerTestButton,
                    {
                      backgroundColor: isTesting ? colors.muted : colors.primary,
                      opacity: pressed ? 0.82 : 1,
                    },
                  ]}
                >
                  {isTesting ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.workerTestButtonText}>Test connection / refresh domains</Text>
                  )}
                </Pressable>
              </View>
            </View>
          );
        })}

        {/* Refresh Interval */}
        <Text style={[styles.sectionTitle, { color: colors.muted }]}>
          Auto refresh
        </Text>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.refreshGrid}>
            {REFRESH_OPTIONS.map((opt) => (
              <Pressable
                key={opt.value}
                onPress={() => setRefreshInterval(opt.value)}
                style={({ pressed }) => [
                  styles.refreshOption,
                  {
                    backgroundColor:
                      refreshInterval === opt.value
                        ? colors.primary
                        : colors.background,
                    borderColor:
                      refreshInterval === opt.value
                        ? colors.primary
                        : colors.border,
                    opacity: pressed ? 0.8 : 1,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.refreshOptionText,
                    {
                      color:
                        refreshInterval === opt.value
                          ? "#FFFFFF"
                          : colors.foreground,
                    },
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.88}
                >
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <Text style={[styles.sectionTitle, { color: colors.muted }]}>
          Appearance
        </Text>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.fieldGroup, { borderBottomColor: colors.border }]}>
            <View style={styles.fieldHeader}>
              <IconSymbol
                name={colorScheme === "light" ? "sun.max.fill" : "moon.fill"}
                size={18}
                color={colors.primary}
              />
              <Text style={[styles.fieldLabel, { color: colors.foreground }]}>
                Theme
              </Text>
            </View>
            <Text style={[styles.fieldHint, styles.themeHintInline, { color: colors.muted }]}>
              Currently using the {getThemeLabel(colorScheme)} theme
              {themePreference === "system" ? " (following the system)" : ""}
              {themePreference === "oled" ? " (pure black dark variant)" : ""}
            </Text>
            <View style={styles.themeGrid}>
              {THEME_OPTIONS.map((option) => {
                const active = themePreference === option.value;
                return (
                  <Pressable
                    key={option.value}
                    onPress={() => setThemePreference(option.value)}
                    style={({ pressed }) => [
                      styles.themeOption,
                      {
                        backgroundColor: active ? colors.primary : colors.background,
                        borderColor: active ? colors.primary : colors.border,
                        opacity: pressed ? 0.8 : 1,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.themeOptionText,
                        { color: active ? "#FFFFFF" : colors.foreground },
                      ]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.82}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>

        {/* Actions */}
        <View style={styles.buttonGroup}>
          <Pressable
            onPress={handleSave}
            disabled={isSaving}
            style={({ pressed }) => [
              styles.primaryButton,
              {
                backgroundColor: isSaving ? colors.muted : colors.primary,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            <Text style={styles.primaryButtonText}>
              {isSaving ? "Saving..." : "Save and open the admin console"}
            </Text>
          </Pressable>
        </View>

        {/* Server Info */}
        {state.settings && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.muted }]}>
              Worker info
            </Text>
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {state.settings.title && (
                <InfoRow label="Site title" value={state.settings.title} colors={colors} />
              )}
              <InfoRow label="Domain count" value={`${state.settings.domains?.length || 0}`} colors={colors} />
              {(state.settings.domains?.length || 0) > 0 && (
                <InfoRow
                  label="Available domains"
                  value={state.settings.domains!.join(", ")}
                  colors={colors}
                />
              )}
              <InfoRow
                label="Send mail"
                value={state.settings.enableSendMail !== false ? "Enabled" : "Disabled"}
                colors={colors}
                valueColor={state.settings.enableSendMail !== false ? colors.success : colors.error}
              />
              <InfoRow
                label="Auto reply"
                value={state.settings.enableAutoReply ? "Enabled" : "Disabled"}
                colors={colors}
              />
              <InfoRow
                label="Address password"
                value={state.settings.enableAddressPassword ? "Enabled" : "Disabled"}
                colors={colors}
              />
              {(state.settings.randomSubdomainDomains?.length || 0) > 0 && (
                <InfoRow
                  label="Random subdomain"
                  value={state.settings.randomSubdomainDomains!.join(", ")}
                  colors={colors}
                />
              )}
              <Pressable
                onPress={() => setShowRawResponse(!showRawResponse)}
                style={styles.rawToggle}
              >
                <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "500" }}>
                  {showRawResponse ? "Hide" : "View"} raw response JSON
                </Text>
              </Pressable>
              {showRawResponse && (
                <View
                  style={[
                    styles.rawBox,
                    { backgroundColor: colors.background, borderColor: colors.border },
                  ]}
                >
                  <Text
                    selectable
                    style={{
                      color: colors.foreground,
                      fontFamily: "Courier",
                      fontSize: 11,
                      lineHeight: 16,
                    }}
                  >
                    {rawResponseText}
                  </Text>
                </View>
              )}
            </View>
          </>
        )}

        {/* Account section (only when active account) */}
        {activeAccount && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.muted }]}>
              Current mailbox: {activeAccount.address}
            </Text>

            {/* Send balance */}
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <InfoRow
                label="Send balance"
                value={
                  state.userSettings?.send_balance !== undefined
                    ? `${state.userSettings.send_balance}`
                    : "(Unknown)"
                }
                colors={colors}
              />
              <InfoRow
                label="Auto reply set"
                value={state.userSettings?.auto_reply?.enabled ? "Yes" : "No"}
                colors={colors}
              />
              <Pressable
                onPress={() => loadUserSettings()}
                style={styles.rawToggle}
              >
                <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "500" }}>
                  Refresh account info
                </Text>
              </Pressable>
            </View>

            {/* Change password */}
            <Pressable
              onPress={() => setShowPasswordSection(!showPasswordSection)}
              style={[
                styles.collapseHeader,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <Text style={{ color: colors.foreground, fontSize: 15, fontWeight: "600" }}>
                Change address password
              </Text>
              <IconSymbol
                name={showPasswordSection ? "chevron.down" : "chevron.right"}
                size={16}
                color={colors.muted}
              />
            </Pressable>
            {showPasswordSection && (
              <View
                style={[
                  styles.collapseBody,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
              >
                <TextInput
                  style={[
                    styles.fieldInput,
                    {
                      color: colors.foreground,
                      borderColor: colors.border,
                      backgroundColor: colors.background,
                      marginBottom: 10,
                    },
                  ]}
                  value={oldPassword}
                  onChangeText={setOldPassword}
                  placeholder="Current password (if set)"
                  placeholderTextColor={colors.muted}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TextInput
                  style={[
                    styles.fieldInput,
                    {
                      color: colors.foreground,
                      borderColor: colors.border,
                      backgroundColor: colors.background,
                      marginBottom: 10,
                    },
                  ]}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder="New password"
                  placeholderTextColor={colors.muted}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Pressable
                  onPress={handleChangePassword}
                  disabled={isChangingPwd}
                  style={({ pressed }) => [
                    styles.secondaryButton,
                    {
                      borderColor: colors.primary,
                      opacity: pressed ? 0.8 : 1,
                    },
                  ]}
                >
                  <Text style={[styles.secondaryButtonText, { color: colors.primary }]}>
                    {isChangingPwd ? "Updating..." : "Update password"}
                  </Text>
                </Pressable>
              </View>
            )}

            {/* Auto reply */}
            {state.settings?.enableAutoReply && (
              <>
                <Pressable
                  onPress={() => setShowAutoReplySection(!showAutoReplySection)}
                  style={[
                    styles.collapseHeader,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                      marginTop: 10,
                    },
                  ]}
                >
                  <Text style={{ color: colors.foreground, fontSize: 15, fontWeight: "600" }}>
                    Auto reply
                  </Text>
                  <IconSymbol
                    name={showAutoReplySection ? "chevron.down" : "chevron.right"}
                    size={16}
                    color={colors.muted}
                  />
                </Pressable>
                {showAutoReplySection && (
                  <View
                    style={[
                      styles.collapseBody,
                      { backgroundColor: colors.surface, borderColor: colors.border },
                    ]}
                  >
                    <View style={styles.autoReplyToggleRow}>
                      <Text style={{ color: colors.foreground, fontSize: 14 }}>
                        Enable auto reply
                      </Text>
                      <Switch
                        value={arEnabled}
                        onValueChange={setArEnabled}
                        trackColor={{ false: colors.border, true: colors.primary }}
                        thumbColor="#FFFFFF"
                      />
                    </View>
                    <TextInput
                      style={[
                        styles.fieldInput,
                        {
                          color: colors.foreground,
                          borderColor: colors.border,
                          backgroundColor: colors.background,
                          marginTop: 10,
                        },
                      ]}
                      value={arSubject}
                      onChangeText={setArSubject}
                      placeholder="Auto reply subject"
                      placeholderTextColor={colors.muted}
                    />
                    <TextInput
                      style={[
                        styles.fieldInput,
                        {
                          color: colors.foreground,
                          borderColor: colors.border,
                          backgroundColor: colors.background,
                          marginTop: 10,
                        },
                      ]}
                      value={arName}
                      onChangeText={setArName}
                      placeholder="Display name (optional)"
                      placeholderTextColor={colors.muted}
                    />
                    <TextInput
                      style={[
                        styles.fieldInput,
                        {
                          color: colors.foreground,
                          borderColor: colors.border,
                          backgroundColor: colors.background,
                          marginTop: 10,
                        },
                      ]}
                      value={arSourcePrefix}
                      onChangeText={setArSourcePrefix}
                      placeholder="Only for senders with this prefix (optional)"
                      placeholderTextColor={colors.muted}
                    />
                    <TextInput
                      style={[
                        styles.fieldInput,
                        {
                          color: colors.foreground,
                          borderColor: colors.border,
                          backgroundColor: colors.background,
                          marginTop: 10,
                          minHeight: 100,
                          textAlignVertical: "top",
                          paddingTop: 10,
                        },
                      ]}
                      value={arMessage}
                      onChangeText={setArMessage}
                      placeholder="Auto reply body"
                      placeholderTextColor={colors.muted}
                      multiline
                    />
                    <Pressable
                      onPress={handleSaveAutoReply}
                      disabled={isSavingAr}
                      style={({ pressed }) => [
                        styles.secondaryButton,
                        {
                          borderColor: colors.primary,
                          opacity: pressed ? 0.8 : 1,
                          marginTop: 14,
                        },
                      ]}
                    >
                      <Text style={[styles.secondaryButtonText, { color: colors.primary }]}>
                        {isSavingAr ? "Saving..." : "Save auto reply"}
                      </Text>
                    </Pressable>
                  </View>
                )}
              </>
            )}
          </>
        )}
        {/* Admin status */}
        {state.isAdminMode && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.muted }]}>Admin</Text>
            <View
              style={[
                styles.card,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <View style={[styles.infoRow, { borderBottomColor: colors.border }]}>
                <Text style={{ color: colors.muted, fontSize: 14 }}>Status</Text>
                <Text style={{ color: colors.success, fontSize: 14, fontWeight: "600" }}>
                  Connected to the admin console
                </Text>
              </View>
              <Pressable
                onPress={handleReturnAdmin}
                style={({ pressed }) => [
                  styles.rawToggle,
                  { opacity: pressed ? 0.6 : 1 },
                ]}
              >
                <Text style={{ color: colors.primary, fontSize: 14, fontWeight: "600" }}>
                  Back to the admin console →
                </Text>
              </Pressable>
            </View>
          </>
        )}

        {/* About */}
        <Text style={[styles.sectionTitle, { color: colors.muted }]}>
          About
        </Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Pressable onPress={handleLogoTap}>
            <View style={styles.aboutContent}>
              <Text style={[styles.aboutTitle, { color: colors.foreground }]}>
                CloudMail
              </Text>
              <Text style={[styles.aboutVersion, { color: colors.muted }]}>
                v{appVersion}
              </Text>
              <Text style={[styles.aboutDesc, { color: colors.muted }]}>
                CloudMail admin client for administrators
              </Text>
            </View>
          </Pressable>
          <View style={[styles.legalLinks, { borderTopColor: colors.border }]}>
            <Pressable
              accessibilityRole="link"
              onPress={() =>
                void handleOpenLegalDocument(PRIVACY_POLICY_URL, "the privacy policy")
              }
              style={({ pressed }) => [
                styles.legalLink,
                styles.legalLinkDivider,
                { borderBottomColor: colors.border, opacity: pressed ? 0.6 : 1 },
              ]}
            >
              <View style={styles.legalLinkLabel}>
                <IconSymbol name="lock.fill" size={18} color={colors.muted} />
                <Text style={[styles.legalLinkText, { color: colors.foreground }]}>
                  Privacy policy
                </Text>
              </View>
              <IconSymbol name="chevron.right" size={20} color={colors.muted} />
            </Pressable>
            <Pressable
              accessibilityRole="link"
              onPress={() =>
                void handleOpenLegalDocument(TERMS_OF_SERVICE_URL, "the terms of use")
              }
              style={({ pressed }) => [
                styles.legalLink,
                { opacity: pressed ? 0.6 : 1 },
              ]}
            >
              <View style={styles.legalLinkLabel}>
                <IconSymbol name="info.circle.fill" size={18} color={colors.muted} />
                <Text style={[styles.legalLinkText, { color: colors.foreground }]}>
                  Terms of use
                </Text>
              </View>
              <IconSymbol name="chevron.right" size={20} color={colors.muted} />
            </Pressable>
          </View>
        </View>

        <View style={styles.bottomSpacer} />
        </ScrollView>

      {/* Admin Login Modal */}
      <Modal
        visible={showAdminModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAdminModal(false)}
      >
        <View style={stylesExtra.modalOverlay}>
          <View style={[stylesExtra.modalCard, { backgroundColor: colors.background }]}>
            <Text style={[stylesExtra.modalTitle, { color: colors.foreground }]}>
              Admin sign-in
            </Text>
            <TextInput
              style={[
                stylesExtra.modalInput,
                {
                  color: colors.foreground,
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                },
              ]}
              value={adminPwdInput}
              onChangeText={setAdminPwdInput}
              placeholder="Admin password"
              placeholderTextColor={colors.muted}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              onSubmitEditing={handleEnterAdmin}
              returnKeyType="done"
              autoFocus
            />
            <View style={stylesExtra.modalActions}>
              <Pressable
                onPress={() => setShowAdminModal(false)}
                style={({ pressed }) => [
                  stylesExtra.modalCancelBtn,
                  { borderColor: colors.border, opacity: pressed ? 0.6 : 1 },
                ]}
              >
                <Text style={{ color: colors.foreground, fontWeight: "600" }}>
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                onPress={handleEnterAdmin}
                disabled={isEnteringAdmin}
                style={({ pressed }) => [
                  stylesExtra.modalConfirmBtn,
                  {
                    backgroundColor: isEnteringAdmin ? colors.muted : colors.primary,
                    opacity: pressed ? 0.8 : 1,
                  },
                ]}
              >
                {isEnteringAdmin ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={{ color: "#FFF", fontWeight: "600" }}>Enter</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

        <Toast message={state.error} type="error" onDismiss={clearError} />
        <Toast message={state.successMessage} type="success" onDismiss={clearSuccess} />
      </ScreenContainer>
  );
}

function InfoRow({
  label,
  value,
  colors,
  valueColor,
}: {
  label: string;
  value: string;
  colors: ReturnType<typeof useColors>;
  valueColor?: string;
}) {
  return (
    <View style={[styles.infoRow, { borderBottomColor: colors.border }]}>
      <Text style={[styles.infoLabel, { color: colors.muted }]}>{label}</Text>
      <Text
        style={[
          styles.infoValue,
          { color: valueColor || colors.foreground },
        ]}
        numberOfLines={3}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: { paddingBottom: 40 },
  headerTitle: {
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: -0.5,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 4,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    paddingHorizontal: 20,
    marginTop: 24,
    marginBottom: 10,
  },
  sectionHeaderRow: {
    marginTop: 24,
    marginBottom: 10,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  sectionTitleInline: {
    paddingHorizontal: 0,
    marginTop: 0,
    marginBottom: 0,
  },
  smallPillButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  smallPillButtonText: {
    fontSize: 12,
    fontWeight: "800",
  },
  card: {
    marginHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
  },
  workerProfileCard: {
    marginBottom: 12,
  },
  workerProfileHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  workerProfileTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  workerProfileTitle: {
    fontSize: 15,
    fontWeight: "800",
  },
  workerProfileStatus: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: "700",
  },
  workerProfileActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  workerTinyButton: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  workerTinyButtonText: {
    fontSize: 12,
    fontWeight: "800",
  },
  workerIconButton: {
    width: 32,
    height: 32,
    borderWidth: 1,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  workerDomainBox: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
    gap: 10,
  },
  workerTestButton: {
    minHeight: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  workerTestButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  fieldGroup: {
    padding: 16,
    borderBottomWidth: 0.5,
  },
  fieldHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  fieldLabel: { fontSize: 14, fontWeight: "600" },
  fieldInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  fieldHint: {
    fontSize: 12,
    marginTop: 6,
    lineHeight: 16,
  },
  refreshGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    padding: 12,
    gap: 8,
  },
  refreshOption: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  refreshOptionText: { fontSize: 13, fontWeight: "500" },
  themeHintInline: {
    marginTop: 0,
    marginBottom: 12,
  },
  themeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  themeOption: {
    flexGrow: 1,
    flexBasis: "47%",
    minHeight: 40,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  themeOptionText: {
    fontSize: 13,
    fontWeight: "600",
    includeFontPadding: false,
  },
  buttonGroup: {
    paddingHorizontal: 16,
    marginTop: 24,
    gap: 10,
  },
  primaryButton: {
    alignItems: "center",
    paddingVertical: 14,
    borderRadius: 12,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  secondaryButton: {
    alignItems: "center",
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  secondaryButtonText: { fontSize: 16, fontWeight: "600" },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
  },
  infoLabel: { fontSize: 14, flex: 1 },
  infoValue: {
    fontSize: 13,
    fontWeight: "500",
    maxWidth: "65%",
    textAlign: "right",
  },
  rawToggle: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  rawBox: {
    margin: 12,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    maxHeight: 280,
  },
  aboutContent: {
    alignItems: "center",
    padding: 20,
  },
  aboutTitle: { fontSize: 18, fontWeight: "700" },
  aboutVersion: { fontSize: 13, marginTop: 4 },
  aboutDesc: {
    fontSize: 13,
    marginTop: 8,
    textAlign: "center",
    lineHeight: 18,
  },
  legalLinks: {
    borderTopWidth: 0.5,
  },
  legalLink: {
    minHeight: 48,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  legalLinkDivider: {
    borderBottomWidth: 0.5,
  },
  legalLinkLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  legalLinkText: {
    fontSize: 14,
    fontWeight: "600",
  },
  bottomSpacer: { height: 40 },
  collapseHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 12,
  },
  collapseBody: {
    marginHorizontal: 16,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: -6,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
  },
  autoReplyToggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
});

const stylesExtra = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    width: "100%",
    maxWidth: 400,
    borderRadius: 16,
    padding: 20,
  },
  modalTitle: { fontSize: 18, fontWeight: "700" },
  modalInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginTop: 16,
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 20,
  },
  modalCancelBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  modalConfirmBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 10,
  },
});
