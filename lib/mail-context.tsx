import React, {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { AppState } from "react-native";
import {
  getConfig,
  saveConfig,
  primeRuntimeConfigSnapshot,
  buildMailAccountIdentityKey,
  getWorkerProfiles,
  saveWorkerProfiles,
  getActiveWorkerProfileId,
  setActiveWorkerProfileId,
  getActiveWorkerProfile,
  getAccounts,
  saveAccounts,
  getActiveAccountIndex,
  setActiveAccountIndex as storeActiveIndex,
  addAccount as storeAddAccount,
  removeAccount as storeRemoveAccount,
  fetchSettings,
  fetchUserAddressSettings,
  createAddress,
  fetchMailHistory,
  fetchMailsSince,
  fetchSentMailHistory,
  fetchSentMailsSince,
  deleteMail as apiDeleteMail,
  deleteSentMail as apiDeleteSentMail,
  clearInbox as apiClearInbox,
  clearSentItems as apiClearSentItems,
  sendMail as apiSendMail,
  requestSendMailAccess as apiRequestSendMailAccess,
  loginWithCredential as apiLoginWithCredential,
  loginWithAddressPassword as apiLoginWithAddressPassword,
  changeAddressPassword as apiChangeAddressPassword,
  setAutoReply as apiSetAutoReply,
  deleteAddressAdmin,
  deleteAddressUser,
  adminLogin as apiAdminLogin,
  type MailAccount,
  type ParsedMail,
  type SiteSettings,
  type SendMailPayload,
  type AutoReply,
  type UserAddressSettings,
  type WorkerProfile,
  type ApiRuntimeOptions,
} from "./api";
import { readMailboxCache, writeMailboxCache } from "./mail-cache";
import { mergeMailLists, sortMailsDesc } from "./mail-list-utils";
import { parseMailBatch } from "./mail-parser";
import { getSyncAnchor, setSyncAnchor, buildAnchorFromMails, clearSyncAnchor } from "./mail-sync-anchor";

function findMailAccountIndex(accounts: MailAccount[], account: MailAccount) {
  const targetKey = buildMailAccountIdentityKey(account);
  return accounts.findIndex(
    (item) => buildMailAccountIdentityKey(item) === targetKey
  );
}

function normalizeEmailDomain(email: string) {
  const parts = email.trim().toLowerCase().split("@");
  return parts.length >= 2 ? parts.pop()?.trim() || "" : "";
}

function getAccountMailboxCacheInput(
  account: MailAccount,
  box: "inbox" | "sent",
  fallbackWorkerUrl?: string
) {
  return {
    workerUrl: account.workerUrl || fallbackWorkerUrl || "",
    address: account.address,
    box,
  };
}

async function readCachedMailboxesForAccount(
  account: MailAccount | undefined,
  fallbackWorkerUrl?: string
) {
  if (!account) {
    return { inbox: [] as ParsedMail[], sent: [] as ParsedMail[] };
  }

  const [cachedInbox, cachedSent] = await Promise.all([
    readMailboxCache(getAccountMailboxCacheInput(account, "inbox", fallbackWorkerUrl)),
    readMailboxCache(getAccountMailboxCacheInput(account, "sent", fallbackWorkerUrl)),
  ]);

  return {
    inbox: sortMailsDesc(cachedInbox),
    sent: sortMailsDesc(cachedSent),
  };
}

// ─── State ──────────────────────────────────────────────────────
interface MailState {
  // Config
  workerUrl: string;
  adminPassword: string;
  sitePassword: string;
  refreshInterval: number;
  isConfigured: boolean;
  workerProfiles: WorkerProfile[];
  activeWorkerProfileId: string;

  // Accounts
  accounts: MailAccount[];
  activeAccountIndex: number;

  // Site settings (per-worker)
  settings: SiteSettings | null;

  // Per-address user settings (auto_reply, send_balance)
  userSettings: UserAddressSettings | null;

  // Mails
  mails: ParsedMail[];
  sentMails: ParsedMail[];
  isLoadingMails: boolean;
  isRefreshing: boolean;
  isLoadingSent: boolean;

  // UI
  error: string | null;
  successMessage: string | null;
  isInitialized: boolean;

  // Admin
  isAdminMode: boolean;
}

const initialState: MailState = {
  workerUrl: "",
  adminPassword: "",
  sitePassword: "",
  refreshInterval: 30,
  isConfigured: false,
  workerProfiles: [],
  activeWorkerProfileId: "",
  accounts: [],
  activeAccountIndex: 0,
  settings: null,
  userSettings: null,
  mails: [],
  sentMails: [],
  isLoadingMails: false,
  isRefreshing: false,
  isLoadingSent: false,
  error: null,
  successMessage: null,
  isInitialized: false,
  isAdminMode: false,
};

// ─── Actions ────────────────────────────────────────────────────
type Action =
  | { type: "INIT"; payload: Partial<MailState> }
  | {
      type: "SET_CONFIG";
      payload: {
        workerUrl: string;
        adminPassword: string;
        sitePassword: string;
        refreshInterval: number;
        workerProfiles?: WorkerProfile[];
        activeWorkerProfileId?: string;
      };
    }
  | {
      type: "SET_WORKER_PROFILES";
      payload: {
        workerProfiles: WorkerProfile[];
        activeWorkerProfileId: string;
      };
    }
  | { type: "SET_SETTINGS"; payload: SiteSettings | null }
  | { type: "SET_USER_SETTINGS"; payload: UserAddressSettings | null }
  | {
      type: "SET_ACCOUNTS";
      payload: { accounts: MailAccount[]; activeIndex: number };
    }
  | { type: "SET_ACTIVE_INDEX"; payload: number }
  | { type: "SET_MAILS"; payload: ParsedMail[] }
  | { type: "SET_SENT_MAILS"; payload: ParsedMail[] }
  | { type: "SET_LOADING_MAILS"; payload: boolean }
  | { type: "SET_LOADING_SENT"; payload: boolean }
  | { type: "SET_REFRESHING"; payload: boolean }
  | { type: "SET_ERROR"; payload: string | null }
  | { type: "SET_SUCCESS"; payload: string | null }
  | { type: "SET_ADMIN_MODE"; payload: boolean }
  | { type: "CLEAR_MESSAGES" };

function reducer(state: MailState, action: Action): MailState {
  switch (action.type) {
    case "INIT":
      return { ...state, ...action.payload, isInitialized: true };
    case "SET_CONFIG": {
      const changed =
        state.workerUrl !== action.payload.workerUrl ||
        state.adminPassword !== action.payload.adminPassword ||
        state.sitePassword !== action.payload.sitePassword;
      return {
        ...state,
        ...action.payload,
        isConfigured: !!action.payload.workerUrl,
        workerProfiles: action.payload.workerProfiles ?? state.workerProfiles,
        activeWorkerProfileId:
          action.payload.activeWorkerProfileId ?? state.activeWorkerProfileId,
        settings: changed ? null : state.settings,
      };
    }
    case "SET_WORKER_PROFILES":
      return {
        ...state,
        workerProfiles: action.payload.workerProfiles,
        activeWorkerProfileId: action.payload.activeWorkerProfileId,
      };
    case "SET_SETTINGS":
      return { ...state, settings: action.payload };
    case "SET_USER_SETTINGS":
      return { ...state, userSettings: action.payload };
    case "SET_ACCOUNTS":
      return {
        ...state,
        accounts: action.payload.accounts,
        activeAccountIndex: action.payload.activeIndex,
      };
    case "SET_ACTIVE_INDEX":
      return { ...state, activeAccountIndex: action.payload };
    case "SET_MAILS":
      return { ...state, mails: action.payload };
    case "SET_SENT_MAILS":
      return { ...state, sentMails: action.payload };
    case "SET_LOADING_MAILS":
      return { ...state, isLoadingMails: action.payload };
    case "SET_LOADING_SENT":
      return { ...state, isLoadingSent: action.payload };
    case "SET_REFRESHING":
      return { ...state, isRefreshing: action.payload };
    case "SET_ERROR":
      return { ...state, error: action.payload };
    case "SET_SUCCESS":
      return { ...state, successMessage: action.payload };
    case "SET_ADMIN_MODE":
      return { ...state, isAdminMode: action.payload };
    case "CLEAR_MESSAGES":
      return { ...state, error: null, successMessage: null };
    default:
      return state;
  }
}

// ─── Context ────────────────────────────────────────────────────
interface MailContextValue {
  state: MailState;
  initialize: () => Promise<void>;
  updateConfig: (config: {
    workerUrl: string;
    adminPassword: string;
    sitePassword: string;
    refreshInterval: number;
  }) => Promise<void>;
  updateWorkerProfiles: (
    profiles: WorkerProfile[],
    activeProfileId: string,
    refreshInterval: number
  ) => Promise<void>;
  saveWorkerProfilesAndEnterAdminLocally: (
    profiles: WorkerProfile[],
    activeProfileId: string,
    refreshInterval: number
  ) => void;
  switchWorkerProfile: (profileId: string) => Promise<void>;
  reloadWorkerProfiles: () => Promise<void>;
  loadSettings: (options?: {
    throwOnError?: boolean;
  }) => Promise<SiteSettings | null>;
  loadUserSettings: () => Promise<UserAddressSettings | null>;
  createNewAddress: (params: {
    name: string;
    domain: string;
    enablePrefix?: boolean;
    enableRandomSubdomain?: boolean;
    workerProfileId?: string;
  }) => Promise<{ address: string; jwt: string; password?: string }>;
  switchAccount: (index: number) => Promise<void>;
  deleteAccount: (
    index: number,
    options?: { removeOnServer?: boolean }
  ) => Promise<void>;
  loadMails: () => Promise<void>;
  refreshMails: () => Promise<void>;
  loadSentMails: () => Promise<void>;
  refreshSentMails: () => Promise<void>;
  deleteMailById: (mailId: number) => Promise<boolean>;
  deleteSentMailById: (mailId: number) => Promise<boolean>;
  clearInbox: () => Promise<void>;
  clearSentItems: () => Promise<void>;
  sendEmail: (payload: SendMailPayload) => Promise<void>;
  requestSendMailAccess: () => Promise<void>;
  importByCredential: (credential: string) => Promise<void>;
  importByPassword: (email: string, password: string) => Promise<void>;
  changePassword: (newPassword: string, oldPassword?: string) => Promise<void>;
  saveAutoReply: (autoReply: AutoReply) => Promise<void>;
  enterAdminModeLocally: (password?: string) => Promise<void>;
  enterAdminMode: (password: string) => Promise<void>;
  exitAdminMode: () => void;
  clearError: () => void;
  clearSuccess: () => void;
  activeAccount: MailAccount | null;
}

const MailContext = createContext<MailContextValue | null>(null);

export function MailProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mailsRef = useRef<ParsedMail[]>([]);
  const sentMailsRef = useRef<ParsedMail[]>([]);
  const inboxSyncPromiseRef = useRef<Promise<void> | null>(null);
  const sentSyncPromiseRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    mailsRef.current = state.mails;
  }, [state.mails]);

  useEffect(() => {
    sentMailsRef.current = state.sentMails;
  }, [state.sentMails]);

  const activeAccount =
    state.accounts.length > 0 &&
    state.activeAccountIndex < state.accounts.length
      ? state.accounts[state.activeAccountIndex]
      : null;
  const activeAccountIdentity = activeAccount
    ? buildMailAccountIdentityKey(activeAccount)
    : "";

  const getMailboxCacheInput = useCallback(
    (account: MailAccount, box: "inbox" | "sent") => ({
      workerUrl: account.workerUrl || state.workerUrl,
      address: account.address,
      box,
    }),
    [state.workerUrl]
  );

  const getAccountApiOptions = useCallback(
    async (account: MailAccount): Promise<ApiRuntimeOptions | undefined> => {
      const profiles = await getWorkerProfiles();
      const profile =
        (account.workerProfileId
          ? profiles.find((item) => item.id === account.workerProfileId)
          : undefined) ||
        (account.workerUrl
          ? profiles.find(
              (item) =>
                item.workerUrl.replace(/\/+$/, "").toLowerCase() ===
                account.workerUrl!.replace(/\/+$/, "").toLowerCase()
            )
          : undefined);
      if (profile) return { workerProfile: profile };
      if (account.workerUrl) {
        return {
          configOverride: {
            workerUrl: account.workerUrl,
            lang: "en",
          },
        };
      }
      return undefined;
    },
    []
  );

  const resolveImportWorkerProfileForEmail = useCallback(async (email: string) => {
    const domain = normalizeEmailDomain(email);
    const [profiles, activeWorker] = await Promise.all([
      getWorkerProfiles(),
      getActiveWorkerProfile(),
    ]);
    if (!domain) return activeWorker;
    const matches = profiles.filter((profile) =>
      (profile.domains || []).some(
        (item) => item.trim().toLowerCase() === domain
      )
    );
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) {
      throw new Error(
        `Domain ${domain} exists on several Workers. Confirm which Worker owns it in admin settings, or switch to a specific Worker before importing.`
      );
    }
    return activeWorker;
  }, []);

  // ── Initialize ──
  const initialize = useCallback(async () => {
    const safeAwait = async <T,>(
      promise: Promise<T>,
      fallback: T,
      timeoutMs = 5000
    ): Promise<T> => {
      try {
        return await Promise.race([
          promise,
          new Promise<T>((resolve) =>
            setTimeout(() => resolve(fallback), timeoutMs)
          ),
        ]);
      } catch {
        return fallback;
      }
    };

    try {
      const workerProfiles = await safeAwait(getWorkerProfiles(), [] as WorkerProfile[]);
      const [config, activeWorkerProfileId, accounts, activeIndex] = await Promise.all([
        safeAwait(getConfig(), {
          workerUrl: "",
          adminPassword: "",
          sitePassword: "",
          refreshInterval: 30,
          lang: "en",
        }),
        safeAwait(getActiveWorkerProfileId(), ""),
        safeAwait(getAccounts(), [] as MailAccount[]),
        safeAwait(getActiveAccountIndex(), 0),
      ]);
      const storedActiveIndex = Number.isFinite(activeIndex) ? activeIndex : 0;
      const normalizedActiveIndex = Math.min(
        storedActiveIndex,
        Math.max(0, accounts.length - 1)
      );
      const activeAccount = accounts[normalizedActiveIndex];
      const cachedMailboxes = await safeAwait(
        readCachedMailboxesForAccount(activeAccount, config.workerUrl),
        { inbox: [] as ParsedMail[], sent: [] as ParsedMail[] }
      );
      mailsRef.current = cachedMailboxes.inbox;
      sentMailsRef.current = cachedMailboxes.sent;

      dispatch({
        type: "INIT",
        payload: {
          workerUrl: config.workerUrl,
          adminPassword: config.adminPassword,
          sitePassword: config.sitePassword,
          refreshInterval: config.refreshInterval,
          isConfigured: !!config.workerUrl,
          workerProfiles,
          activeWorkerProfileId,
          accounts,
          activeAccountIndex: normalizedActiveIndex,
          mails: cachedMailboxes.inbox,
          sentMails: cachedMailboxes.sent,
          isAdminMode: !!(config.workerUrl && config.adminPassword),
        },
      });
    } catch {
      mailsRef.current = [];
      sentMailsRef.current = [];
      dispatch({
        type: "INIT",
        payload: {
          workerUrl: "",
          adminPassword: "",
          sitePassword: "",
          refreshInterval: 30,
          isConfigured: false,
          workerProfiles: [],
          activeWorkerProfileId: "",
          accounts: [],
          activeAccountIndex: 0,
          mails: [],
          sentMails: [],
          isAdminMode: false,
        },
      });
      dispatch({ type: "SET_ERROR", payload: "Initialization failed. Please check the configuration" });
    }
  }, []);

  // ── Update Config ──
  const updateConfig = useCallback(
    async (config: {
      workerUrl: string;
      adminPassword: string;
      sitePassword: string;
      refreshInterval: number;
    }) => {
      try {
        await saveConfig(config);
        const [workerProfiles, activeWorkerProfileId] = await Promise.all([
          getWorkerProfiles(),
          getActiveWorkerProfileId(),
        ]);
        dispatch({
          type: "SET_CONFIG",
          payload: { ...config, workerProfiles, activeWorkerProfileId },
        });
        dispatch({ type: "SET_SUCCESS", payload: "Configuration saved" });
      } catch {
        dispatch({ type: "SET_ERROR", payload: "Failed to save the configuration" });
        throw new Error("Failed to save the configuration");
      }
    },
    []
  );

  const updateWorkerProfiles = useCallback(
    async (
      profiles: WorkerProfile[],
      activeProfileId: string,
      refreshInterval: number
    ) => {
      try {
        const savedProfiles = await saveWorkerProfiles(profiles);
        await setActiveWorkerProfileId(activeProfileId || savedProfiles[0]?.id || "");
        await saveConfig({ refreshInterval });
        const [config, nextProfiles, nextActiveId] = await Promise.all([
          getConfig(),
          getWorkerProfiles(),
          getActiveWorkerProfileId(),
        ]);
        dispatch({
          type: "SET_CONFIG",
          payload: {
            workerUrl: config.workerUrl,
            adminPassword: config.adminPassword,
            sitePassword: config.sitePassword,
            refreshInterval: config.refreshInterval,
            workerProfiles: nextProfiles,
            activeWorkerProfileId: nextActiveId,
          },
        });
        dispatch({ type: "SET_SETTINGS", payload: null });
        dispatch({ type: "SET_SUCCESS", payload: "Workers configuration saved" });
      } catch {
        dispatch({ type: "SET_ERROR", payload: "Failed to save the Workers configuration" });
        throw new Error("Failed to save the Workers configuration");
      }
    },
    []
  );

  const saveWorkerProfilesAndEnterAdminLocally = useCallback((
    profiles: WorkerProfile[],
    activeProfileId: string,
    refreshInterval: number
  ) => {
    const activeProfile =
      profiles.find((profile) => profile.id === activeProfileId) || profiles[0];
    if (!activeProfile?.workerUrl || !activeProfile.adminPassword) {
      throw new Error("Set the Worker URL and admin password first");
    }

    primeRuntimeConfigSnapshot({
      workerUrl: activeProfile.workerUrl,
      adminPassword: activeProfile.adminPassword,
      sitePassword: activeProfile.sitePassword || "",
      refreshInterval,
      lang: "en",
    });

    dispatch({
      type: "SET_CONFIG",
      payload: {
        workerUrl: activeProfile.workerUrl,
        adminPassword: activeProfile.adminPassword,
        sitePassword: activeProfile.sitePassword || "",
        refreshInterval,
        workerProfiles: profiles,
        activeWorkerProfileId: activeProfile.id,
      },
    });
    dispatch({ type: "SET_SETTINGS", payload: null });
    dispatch({ type: "SET_ADMIN_MODE", payload: true });
    dispatch({ type: "SET_SUCCESS", payload: "Entered admin mode" });

    void (async () => {
      try {
        const savedProfiles = await saveWorkerProfiles(profiles);
        await setActiveWorkerProfileId(activeProfile.id || savedProfiles[0]?.id || "");
        await saveConfig({ refreshInterval });
        const [config, nextProfiles, nextActiveId] = await Promise.all([
          getConfig(),
          getWorkerProfiles(),
          getActiveWorkerProfileId(),
        ]);
        dispatch({
          type: "SET_CONFIG",
          payload: {
            workerUrl: config.workerUrl || activeProfile.workerUrl,
            adminPassword: config.adminPassword || activeProfile.adminPassword,
            sitePassword: config.sitePassword || activeProfile.sitePassword || "",
            refreshInterval: config.refreshInterval || refreshInterval,
            workerProfiles: nextProfiles.length > 0 ? nextProfiles : profiles,
            activeWorkerProfileId: nextActiveId || activeProfile.id,
          },
        });
      } catch {
        dispatch({
          type: "SET_ERROR",
          payload: "Opened the admin console, but saving locally failed. Please save again in Settings later",
        });
      }
    })();
  }, []);

  const reloadWorkerProfiles = useCallback(async () => {
    const [workerProfiles, activeWorkerProfileId] = await Promise.all([
      getWorkerProfiles(),
      getActiveWorkerProfileId(),
    ]);
    dispatch({
      type: "SET_WORKER_PROFILES",
      payload: { workerProfiles, activeWorkerProfileId },
    });
  }, []);

  const switchWorkerProfile = useCallback(async (profileId: string) => {
    try {
      await setActiveWorkerProfileId(profileId);
      const [config, workerProfiles, activeWorkerProfileId] = await Promise.all([
        getConfig(),
        getWorkerProfiles(),
        getActiveWorkerProfileId(),
      ]);
      dispatch({
        type: "SET_CONFIG",
        payload: {
          workerUrl: config.workerUrl,
          adminPassword: config.adminPassword,
          sitePassword: config.sitePassword,
          refreshInterval: config.refreshInterval,
          workerProfiles,
          activeWorkerProfileId,
        },
      });
      dispatch({ type: "SET_SETTINGS", payload: null });
      dispatch({ type: "SET_USER_SETTINGS", payload: null });
      mailsRef.current = [];
      sentMailsRef.current = [];
      dispatch({ type: "SET_MAILS", payload: [] });
      dispatch({ type: "SET_SENT_MAILS", payload: [] });
      dispatch({ type: "SET_SUCCESS", payload: "Switched Worker" });
    } catch {
      dispatch({ type: "SET_ERROR", payload: "Failed to switch Worker" });
      throw new Error("Failed to switch Worker");
    }
  }, []);

  // ── Load Site Settings ──
  const loadSettings = useCallback(
    async (options?: { throwOnError?: boolean }) => {
      try {
        const settings = await fetchSettings();
        dispatch({ type: "SET_SETTINGS", payload: settings });
        return settings;
      } catch (err: any) {
        dispatch({
          type: "SET_ERROR",
          payload: err.message || "Failed to get settings",
        });
        if (options?.throwOnError) throw err;
        return null;
      }
    },
    []
  );

  // ── Load per-address user settings ──
  const loadUserSettings = useCallback(async () => {
    const accounts = await getAccounts();
    const idx = await getActiveAccountIndex();
    const account = accounts[idx];
    if (!account) {
      dispatch({ type: "SET_USER_SETTINGS", payload: null });
      return null;
    }
    try {
      const apiOptions = await getAccountApiOptions(account);
      const settings = await fetchUserAddressSettings(account.jwt, apiOptions);
      dispatch({
        type: "SET_USER_SETTINGS",
        payload: { ...settings, fetched: true },
      });
      return settings;
    } catch {
      // Silent — user settings is an optional feature. Store fetched=true so UI doesn't stall.
      dispatch({
        type: "SET_USER_SETTINGS",
        payload: { fetched: true },
      });
      return null;
    }
  }, [getAccountApiOptions]);

  // ── Create Address ──
  const createNewAddress = useCallback(
    async (params: {
      name: string;
      domain: string;
      enablePrefix?: boolean;
      enableRandomSubdomain?: boolean;
      workerProfileId?: string;
    }) => {
      try {
        const result = await createAddress(params);
        const profiles = await getWorkerProfiles();
        const targetWorker =
          (params.workerProfileId
            ? profiles.find((profile) => profile.id === params.workerProfileId)
            : undefined) ||
          (await getActiveWorkerProfile());
        const newAccount: MailAccount = {
          address: result.address,
          jwt: result.jwt,
          addressId: result.address_id,
          password: result.password || undefined,
          createdAt: new Date().toISOString(),
          workerProfileId: targetWorker?.id,
          workerUrl: targetWorker?.workerUrl || state.workerUrl,
        };
        await storeAddAccount(newAccount);
        const accounts = await getAccounts();
        const idx = findMailAccountIndex(accounts, newAccount);
        const activeIndex = idx >= 0 ? idx : accounts.length - 1;
        dispatch({
          type: "SET_ACCOUNTS",
          payload: { accounts, activeIndex },
        });
        dispatch({
          type: "SET_SUCCESS",
          payload: `Mailbox ${result.address} created`,
        });
        return {
          address: result.address,
          jwt: result.jwt,
          password: result.password || undefined,
        };
      } catch (err: any) {
        dispatch({
          type: "SET_ERROR",
          payload: err.message || "Failed to create the mailbox",
        });
        throw err;
      }
    },
    [state.workerUrl]
  );

  // ── Switch Account ──
  const switchAccount = useCallback(
    async (index: number) => {
      await storeActiveIndex(index);
      const accounts = await getAccounts();
      const nextAccount = accounts[index];

      dispatch({ type: "SET_ACTIVE_INDEX", payload: index });
      dispatch({ type: "SET_USER_SETTINGS", payload: null });

      if (!nextAccount) {
        mailsRef.current = [];
        sentMailsRef.current = [];
        dispatch({ type: "SET_MAILS", payload: [] });
        dispatch({ type: "SET_SENT_MAILS", payload: [] });
        return;
      }

      const [cachedInbox, cachedSent] = await Promise.all([
        readMailboxCache(getMailboxCacheInput(nextAccount, "inbox")),
        readMailboxCache(getMailboxCacheInput(nextAccount, "sent")),
      ]);

      const nextInbox = sortMailsDesc(cachedInbox);
      const nextSent = sortMailsDesc(cachedSent);
      mailsRef.current = nextInbox;
      sentMailsRef.current = nextSent;
      dispatch({ type: "SET_MAILS", payload: nextInbox });
      dispatch({ type: "SET_SENT_MAILS", payload: nextSent });
    },
    [getMailboxCacheInput]
  );

  // ── Delete Account ──
  const deleteAccount = useCallback(
    async (index: number, options?: { removeOnServer?: boolean }) => {
      try {
        if (options?.removeOnServer) {
          const accounts = await getAccounts();
          const account = accounts[index];
          if (account) {
            try {
              const apiOptions = await getAccountApiOptions(account);
              if (account.addressId !== undefined) {
                await deleteAddressAdmin(account.addressId, apiOptions);
              } else {
                await deleteAddressUser(account.jwt, apiOptions);
              }
            } catch (err: any) {
              dispatch({
                type: "SET_ERROR",
                payload: `Server delete failed: ${err.message || "Unknown error"} (removed locally)`,
              });
            }
          }
        }
        await storeRemoveAccount(index);
        const accounts = await getAccounts();
        const activeIndex = await getActiveAccountIndex();
        dispatch({
          type: "SET_ACCOUNTS",
          payload: { accounts, activeIndex },
        });
        mailsRef.current = [];
        sentMailsRef.current = [];
        dispatch({ type: "SET_MAILS", payload: [] });
        dispatch({ type: "SET_SENT_MAILS", payload: [] });
        dispatch({ type: "SET_SUCCESS", payload: "Mailbox removed" });
      } catch (err: any) {
        dispatch({ type: "SET_ERROR", payload: err.message || "Delete failed" });
      }
    },
    [getAccountApiOptions]
  );

  // ── Load Mails ──
  const loadMails = useCallback(async () => {
    if (inboxSyncPromiseRef.current) {
      await inboxSyncPromiseRef.current;
      return;
    }

    const syncTask = (async () => {
      const accounts = await getAccounts();
      const activeIndex = await getActiveAccountIndex();
      const normalizedActiveIndex = Number.isFinite(activeIndex) ? activeIndex : 0;
      const account = accounts[normalizedActiveIndex] || accounts[0];
      if (!account) return;

      const cacheInput = getMailboxCacheInput(account, "inbox");
      const syncScope = {
        workerUrl: cacheInput.workerUrl,
        address: account.address,
        box: "inbox" as const,
      };
      const cached = await readMailboxCache(cacheInput);
      if (cached.length > 0) {
        const cachedMails = sortMailsDesc(cached);
        mailsRef.current = cachedMails;
        dispatch({ type: "SET_MAILS", payload: cachedMails });
      }

      dispatch({ type: "SET_LOADING_MAILS", payload: true });
      try {
        const apiOptions = await getAccountApiOptions(account);
        let anchor = await getSyncAnchor(syncScope);
        if (!anchor && mailsRef.current.length > 0) {
          const cachedAnchor = buildAnchorFromMails(mailsRef.current);
          if (cachedAnchor) {
            anchor = cachedAnchor;
            await setSyncAnchor(syncScope, cachedAnchor);
          }
        }

        let parsed: ParsedMail[];
        if (anchor) {
          const result = await fetchMailsSince(
            account.jwt,
            anchor.latestMailId,
            apiOptions
          );
          parsed = await parseMailBatch(result.newMails);
          if (result.newMails.length > 0 && !result.hasMore) {
            await setSyncAnchor(syncScope, {
              latestMailId: result.latestMailId,
              latestCreatedAt: result.latestCreatedAt,
              totalFetched: anchor.totalFetched + result.newMails.length,
            });
          }
        } else {
          const rawMails = await fetchMailHistory(account.jwt, {
            pageSize: 100,
            maxPages: 100,
            ...apiOptions,
          });
          parsed = await parseMailBatch(rawMails);
          const newAnchor = buildAnchorFromMails(rawMails);
          if (newAnchor) {
            await setSyncAnchor(syncScope, newAnchor);
          }
        }

        const nextMails = mergeMailLists(mailsRef.current, parsed);
        mailsRef.current = nextMails;
        dispatch({ type: "SET_MAILS", payload: nextMails });
        await writeMailboxCache(cacheInput, nextMails);
      } catch (err: any) {
        dispatch({
          type: "SET_ERROR",
          payload: err.message || "Failed to load mail",
        });
      } finally {
        dispatch({ type: "SET_LOADING_MAILS", payload: false });
      }
    })();

    inboxSyncPromiseRef.current = syncTask;
    try {
      await syncTask;
    } finally {
      if (inboxSyncPromiseRef.current === syncTask) {
        inboxSyncPromiseRef.current = null;
      }
    }
  }, [getAccountApiOptions, getMailboxCacheInput]);

  // ── Refresh Mails ──
  const refreshMails = useCallback(async () => {
    if (inboxSyncPromiseRef.current) {
      await inboxSyncPromiseRef.current;
      return;
    }

    const syncTask = (async () => {
      const accounts = await getAccounts();
      const activeIndex = await getActiveAccountIndex();
      const normalizedActiveIndex = Number.isFinite(activeIndex) ? activeIndex : 0;
      const account = accounts[normalizedActiveIndex] || accounts[0];
      if (!account) return;

      const cacheInput = getMailboxCacheInput(account, "inbox");
      const syncScope = {
        workerUrl: cacheInput.workerUrl,
        address: account.address,
        box: "inbox" as const,
      };
      dispatch({ type: "SET_REFRESHING", payload: true });
      try {
        const apiOptions = await getAccountApiOptions(account);
        let anchor = await getSyncAnchor(syncScope);
        if (!anchor && mailsRef.current.length > 0) {
          const cachedAnchor = buildAnchorFromMails(mailsRef.current);
          if (cachedAnchor) {
            anchor = cachedAnchor;
            await setSyncAnchor(syncScope, cachedAnchor);
          }
        }

        let parsed: ParsedMail[];
        if (anchor) {
          const result = await fetchMailsSince(
            account.jwt,
            anchor.latestMailId,
            apiOptions
          );
          parsed = await parseMailBatch(result.newMails);
          if (result.newMails.length > 0 && !result.hasMore) {
            await setSyncAnchor(syncScope, {
              latestMailId: result.latestMailId,
              latestCreatedAt: result.latestCreatedAt,
              totalFetched: anchor.totalFetched + result.newMails.length,
            });
          }
        } else {
          const rawMails = await fetchMailHistory(account.jwt, {
            pageSize: 100,
            maxPages: 100,
            ...apiOptions,
          });
          parsed = await parseMailBatch(rawMails);
          const newAnchor = buildAnchorFromMails(rawMails);
          if (newAnchor) {
            await setSyncAnchor(syncScope, newAnchor);
          }
        }

        const nextMails = mergeMailLists(mailsRef.current, parsed);
        mailsRef.current = nextMails;
        dispatch({ type: "SET_MAILS", payload: nextMails });
        await writeMailboxCache(cacheInput, nextMails);
      } catch {
        // Silently fail on auto-refresh
      } finally {
        dispatch({ type: "SET_REFRESHING", payload: false });
      }
    })();

    inboxSyncPromiseRef.current = syncTask;
    try {
      await syncTask;
    } finally {
      if (inboxSyncPromiseRef.current === syncTask) {
        inboxSyncPromiseRef.current = null;
      }
    }
  }, [getAccountApiOptions, getMailboxCacheInput]);

  // ── Load Sent Mails ──
  const loadSentMails = useCallback(async () => {
    if (sentSyncPromiseRef.current) {
      await sentSyncPromiseRef.current;
      return;
    }

    const syncTask = (async () => {
      const accounts = await getAccounts();
      const activeIndex = await getActiveAccountIndex();
      const normalizedActiveIndex = Number.isFinite(activeIndex) ? activeIndex : 0;
      const account = accounts[normalizedActiveIndex] || accounts[0];
      if (!account) return;

      const cacheInput = getMailboxCacheInput(account, "sent");
      const syncScope = {
        workerUrl: cacheInput.workerUrl,
        address: account.address,
        box: "sent" as const,
      };
      const cached = await readMailboxCache(cacheInput);
      if (cached.length > 0) {
        const cachedMails = sortMailsDesc(cached);
        sentMailsRef.current = cachedMails;
        dispatch({ type: "SET_SENT_MAILS", payload: cachedMails });
      }

      dispatch({ type: "SET_LOADING_SENT", payload: true });
      try {
        const apiOptions = await getAccountApiOptions(account);
        let anchor = await getSyncAnchor(syncScope);
        if (!anchor && sentMailsRef.current.length > 0) {
          const cachedAnchor = buildAnchorFromMails(sentMailsRef.current);
          if (cachedAnchor) {
            anchor = cachedAnchor;
            await setSyncAnchor(syncScope, cachedAnchor);
          }
        }

        let parsed: ParsedMail[];
        if (anchor) {
          const result = await fetchSentMailsSince(
            account.jwt,
            anchor.latestMailId,
            apiOptions
          );
          parsed = await parseMailBatch(result.newMails);
          if (result.newMails.length > 0 && !result.hasMore) {
            await setSyncAnchor(syncScope, {
              latestMailId: result.latestMailId,
              latestCreatedAt: result.latestCreatedAt,
              totalFetched: anchor.totalFetched + result.newMails.length,
            });
          }
        } else {
          const rawMails = await fetchSentMailHistory(account.jwt, {
            pageSize: 100,
            maxPages: 100,
            ...apiOptions,
          });
          parsed = await parseMailBatch(rawMails);
          const newAnchor = buildAnchorFromMails(rawMails);
          if (newAnchor) {
            await setSyncAnchor(syncScope, newAnchor);
          }
        }

        const nextMails = mergeMailLists(sentMailsRef.current, parsed);
        sentMailsRef.current = nextMails;
        dispatch({ type: "SET_SENT_MAILS", payload: nextMails });
        await writeMailboxCache(cacheInput, nextMails);
      } catch (err: any) {
        dispatch({
          type: "SET_ERROR",
          payload: err.message || "Failed to load the sent folder",
        });
      } finally {
        dispatch({ type: "SET_LOADING_SENT", payload: false });
      }
    })();

    sentSyncPromiseRef.current = syncTask;
    try {
      await syncTask;
    } finally {
      if (sentSyncPromiseRef.current === syncTask) {
        sentSyncPromiseRef.current = null;
      }
    }
  }, [getAccountApiOptions, getMailboxCacheInput]);

  // ── Refresh Sent Mails ──
  const refreshSentMails = useCallback(async () => {
    if (sentSyncPromiseRef.current) {
      await sentSyncPromiseRef.current;
      return;
    }

    const syncTask = (async () => {
      const accounts = await getAccounts();
      const activeIndex = await getActiveAccountIndex();
      const normalizedActiveIndex = Number.isFinite(activeIndex) ? activeIndex : 0;
      const account = accounts[normalizedActiveIndex] || accounts[0];
      if (!account) return;

      const cacheInput = getMailboxCacheInput(account, "sent");
      const syncScope = {
        workerUrl: cacheInput.workerUrl,
        address: account.address,
        box: "sent" as const,
      };
      dispatch({ type: "SET_LOADING_SENT", payload: true });
      try {
        const apiOptions = await getAccountApiOptions(account);
        let anchor = await getSyncAnchor(syncScope);
        if (!anchor && sentMailsRef.current.length > 0) {
          const cachedAnchor = buildAnchorFromMails(sentMailsRef.current);
          if (cachedAnchor) {
            anchor = cachedAnchor;
            await setSyncAnchor(syncScope, cachedAnchor);
          }
        }

        let parsed: ParsedMail[];
        if (anchor) {
          const result = await fetchSentMailsSince(
            account.jwt,
            anchor.latestMailId,
            apiOptions
          );
          parsed = await parseMailBatch(result.newMails);
          if (result.newMails.length > 0 && !result.hasMore) {
            await setSyncAnchor(syncScope, {
              latestMailId: result.latestMailId,
              latestCreatedAt: result.latestCreatedAt,
              totalFetched: anchor.totalFetched + result.newMails.length,
            });
          }
        } else {
          const rawMails = await fetchSentMailHistory(account.jwt, {
            pageSize: 100,
            maxPages: 100,
            ...apiOptions,
          });
          parsed = await parseMailBatch(rawMails);
          const newAnchor = buildAnchorFromMails(rawMails);
          if (newAnchor) {
            await setSyncAnchor(syncScope, newAnchor);
          }
        }

        const nextMails = mergeMailLists(sentMailsRef.current, parsed);
        sentMailsRef.current = nextMails;
        dispatch({ type: "SET_SENT_MAILS", payload: nextMails });
        await writeMailboxCache(cacheInput, nextMails);
      } catch {
        // Silently fail on incremental refresh
      } finally {
        dispatch({ type: "SET_LOADING_SENT", payload: false });
      }
    })();

    sentSyncPromiseRef.current = syncTask;
    try {
      await syncTask;
    } finally {
      if (sentSyncPromiseRef.current === syncTask) {
        sentSyncPromiseRef.current = null;
      }
    }
  }, [getAccountApiOptions, getMailboxCacheInput]);

  // ── Delete Mail ──
  const deleteMailById = useCallback(async (mailId: number) => {
    const accounts = await getAccounts();
    const activeIndex = await getActiveAccountIndex();
    const account = accounts[activeIndex];
    if (!account) return false;

    try {
      const apiOptions = await getAccountApiOptions(account);
      await apiDeleteMail(account.jwt, mailId, apiOptions);
      const nextMails = mailsRef.current.filter((m) => m.id !== mailId);
      mailsRef.current = nextMails;
      dispatch({
        type: "SET_MAILS",
        payload: nextMails,
      });
      await writeMailboxCache(getMailboxCacheInput(account, "inbox"), nextMails);
      dispatch({ type: "SET_SUCCESS", payload: "Email deleted" });
      return true;
    } catch (err: any) {
      dispatch({
        type: "SET_ERROR",
        payload: err.message || "Failed to delete the email",
      });
      return false;
    }
  }, [getAccountApiOptions, getMailboxCacheInput]);

  // ── Delete Sent Mail ──
  const deleteSentMailById = useCallback(
    async (mailId: number) => {
      const accounts = await getAccounts();
      const activeIndex = await getActiveAccountIndex();
      const account = accounts[activeIndex];
      if (!account) return false;

      try {
        const apiOptions = await getAccountApiOptions(account);
        await apiDeleteSentMail(account.jwt, mailId, apiOptions);
        const nextMails = sentMailsRef.current.filter((m) => m.id !== mailId);
        sentMailsRef.current = nextMails;
        dispatch({
          type: "SET_SENT_MAILS",
          payload: nextMails,
        });
        await writeMailboxCache(getMailboxCacheInput(account, "sent"), nextMails);
        dispatch({ type: "SET_SUCCESS", payload: "Deleted" });
        return true;
      } catch (err: any) {
        dispatch({
          type: "SET_ERROR",
          payload: err.message || "Delete failed",
        });
        return false;
      }
    },
    [getAccountApiOptions, getMailboxCacheInput]
  );

  // ── Clear Inbox ──
  const clearInbox = useCallback(async () => {
    const accounts = await getAccounts();
    const activeIndex = await getActiveAccountIndex();
    const account = accounts[activeIndex];
    if (!account) return;
    try {
      const apiOptions = await getAccountApiOptions(account);
      await apiClearInbox(account.jwt, apiOptions);
      mailsRef.current = [];
      dispatch({ type: "SET_MAILS", payload: [] });
      const cacheInput = getMailboxCacheInput(account, "inbox");
      await writeMailboxCache(cacheInput, []);
      await clearSyncAnchor({
        workerUrl: cacheInput.workerUrl,
        address: account.address,
        box: "inbox",
      });
      dispatch({ type: "SET_SUCCESS", payload: "Inbox emptied" });
    } catch (err: any) {
      dispatch({ type: "SET_ERROR", payload: err.message || "Failed to empty" });
    }
  }, [getAccountApiOptions, getMailboxCacheInput]);

  // ── Clear Sent ──
  const clearSentItems = useCallback(async () => {
    const accounts = await getAccounts();
    const activeIndex = await getActiveAccountIndex();
    const account = accounts[activeIndex];
    if (!account) return;
    try {
      const apiOptions = await getAccountApiOptions(account);
      await apiClearSentItems(account.jwt, apiOptions);
      sentMailsRef.current = [];
      dispatch({ type: "SET_SENT_MAILS", payload: [] });
      const cacheInput = getMailboxCacheInput(account, "sent");
      await writeMailboxCache(cacheInput, []);
      await clearSyncAnchor({
        workerUrl: cacheInput.workerUrl,
        address: account.address,
        box: "sent",
      });
      dispatch({ type: "SET_SUCCESS", payload: "Sent folder emptied" });
    } catch (err: any) {
      dispatch({ type: "SET_ERROR", payload: err.message || "Failed to empty" });
    }
  }, [getAccountApiOptions, getMailboxCacheInput]);

  // ── Send Email ──
  const sendEmail = useCallback(async (payload: SendMailPayload) => {
    const accounts = await getAccounts();
    const activeIndex = await getActiveAccountIndex();
    const account = accounts[activeIndex];
    if (!account) throw new Error("Select an email address first");

    try {
      const apiOptions = await getAccountApiOptions(account);
      await apiSendMail(account.jwt, payload, apiOptions);
      dispatch({ type: "SET_SUCCESS", payload: "Email sent" });
    } catch (err: any) {
      dispatch({ type: "SET_ERROR", payload: err.message || "Send failed" });
      throw err;
    }
  }, [getAccountApiOptions]);

  // ── Request Send Mail Access ──
  const requestSendMailAccess = useCallback(async () => {
    const accounts = await getAccounts();
    const activeIndex = await getActiveAccountIndex();
    const account = accounts[activeIndex];
    if (!account) throw new Error("Select an email address first");
    try {
      const apiOptions = await getAccountApiOptions(account);
      await apiRequestSendMailAccess(account.jwt, apiOptions);
      dispatch({ type: "SET_SUCCESS", payload: "Send access requested" });
    } catch (err: any) {
      dispatch({
        type: "SET_ERROR",
        payload: err.message || "Request failed",
      });
      throw err;
    }
  }, [getAccountApiOptions]);

  // ── Import by Credential (JWT string) ──
  const importByCredential = useCallback(async (credential: string) => {
    try {
      const activeWorker = await getActiveWorkerProfile();
      const apiOptions = activeWorker ? { workerProfile: activeWorker } : undefined;
      const { jwt } = await apiLoginWithCredential(credential.trim(), apiOptions);
      // We don't know the address from just the credential — use /api/settings to fetch it.
      const userSettings = await fetchUserAddressSettings(jwt, apiOptions).catch(() => null);
      const address = userSettings?.address;
      if (!address) {
        throw new Error("Could not get the email address for this credential");
      }
      const newAccount: MailAccount = {
        address,
        jwt,
        createdAt: new Date().toISOString(),
        workerProfileId: activeWorker?.id,
        workerUrl: activeWorker?.workerUrl || state.workerUrl,
      };
      await storeAddAccount(newAccount);
      const accounts = await getAccounts();
      const idx = findMailAccountIndex(accounts, newAccount);
      dispatch({
        type: "SET_ACCOUNTS",
        payload: {
          accounts,
          activeIndex: idx >= 0 ? idx : accounts.length - 1,
        },
      });
      dispatch({ type: "SET_SUCCESS", payload: `Imported ${address}` });
    } catch (err: any) {
      dispatch({
        type: "SET_ERROR",
        payload: err.message || "Credential import failed",
      });
      throw err;
    }
  }, [state.workerUrl]);

  // ── Import by Email + Password ──
  const importByPassword = useCallback(
    async (email: string, password: string) => {
      try {
        const activeWorker = await resolveImportWorkerProfileForEmail(email);
        const apiOptions = activeWorker ? { workerProfile: activeWorker } : undefined;
        const { jwt } = await apiLoginWithAddressPassword({ email, password }, apiOptions);
        const newAccount: MailAccount = {
          address: email,
          jwt,
          password,
          createdAt: new Date().toISOString(),
          workerProfileId: activeWorker?.id,
          workerUrl: activeWorker?.workerUrl || state.workerUrl,
        };
        await storeAddAccount(newAccount);
        const accounts = await getAccounts();
        const idx = findMailAccountIndex(accounts, newAccount);
        dispatch({
          type: "SET_ACCOUNTS",
          payload: {
            accounts,
            activeIndex: idx >= 0 ? idx : accounts.length - 1,
          },
        });
        dispatch({ type: "SET_SUCCESS", payload: `Imported ${email}` });
      } catch (err: any) {
        dispatch({
          type: "SET_ERROR",
          payload: err.message || "Sign-in failed",
        });
        throw err;
      }
    },
    [resolveImportWorkerProfileForEmail, state.workerUrl]
  );

  // ── Change Password ──
  const changePassword = useCallback(
    async (newPassword: string, oldPassword?: string) => {
      const accounts = await getAccounts();
      const activeIndex = await getActiveAccountIndex();
      const account = accounts[activeIndex];
      if (!account) throw new Error("Select an email address first");
      try {
        const apiOptions = await getAccountApiOptions(account);
        await apiChangeAddressPassword(account.jwt, {
          password: newPassword,
          old_password: oldPassword,
        }, apiOptions);
        // Persist the new password so we can show it in the UI
        const next = [...accounts];
        next[activeIndex] = { ...account, password: newPassword };
        await saveAccounts(next);
        dispatch({
          type: "SET_ACCOUNTS",
          payload: { accounts: next, activeIndex },
        });
        dispatch({ type: "SET_SUCCESS", payload: "Password updated" });
      } catch (err: any) {
        dispatch({
          type: "SET_ERROR",
          payload: err.message || "Password update failed",
        });
        throw err;
      }
    },
    [getAccountApiOptions]
  );

  // ── Save Auto Reply ──
  const saveAutoReply = useCallback(async (autoReply: AutoReply) => {
    const accounts = await getAccounts();
    const activeIndex = await getActiveAccountIndex();
    const account = accounts[activeIndex];
    if (!account) throw new Error("Select an email address first");
    try {
      const apiOptions = await getAccountApiOptions(account);
      await apiSetAutoReply(account.jwt, autoReply, apiOptions);
      dispatch({
        type: "SET_USER_SETTINGS",
        payload: {
          ...(state.userSettings || {}),
          auto_reply: autoReply,
          fetched: true,
        },
      });
      dispatch({ type: "SET_SUCCESS", payload: "Auto reply saved" });
    } catch (err: any) {
      dispatch({
        type: "SET_ERROR",
        payload: err.message || "Failed to save auto reply",
      });
      throw err;
    }
  }, [getAccountApiOptions, state.userSettings]);

  const clearError = useCallback(() => {
    dispatch({ type: "SET_ERROR", payload: null });
  }, []);
  const clearSuccess = useCallback(() => {
    dispatch({ type: "SET_SUCCESS", payload: null });
  }, []);

  // ── Admin Mode ──
  const enterAdminMode = useCallback(async (password: string) => {
    if (!password.trim()) {
      throw new Error("Enter the admin password");
    }
    try {
      const trimmedPassword = password.trim();
      // Add a 20s fallback timeout to sign-in so the settings save button never gets stuck on "Saving".
      await Promise.race([
        apiAdminLogin(trimmedPassword),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("Admin sign-in timed out. Check the Worker URL or network")),
            20000
          )
        ),
      ]);
      const [latestConfig, workerProfiles, activeWorkerProfileId] = await Promise.all([
        getConfig(),
        getWorkerProfiles(),
        getActiveWorkerProfileId(),
      ]);
      dispatch({
        type: "SET_CONFIG",
        payload: {
          workerUrl: latestConfig.workerUrl || state.workerUrl,
          adminPassword: trimmedPassword,
          sitePassword: latestConfig.sitePassword,
          refreshInterval: Number.isFinite(latestConfig.refreshInterval)
            ? latestConfig.refreshInterval
            : state.refreshInterval,
          workerProfiles,
          activeWorkerProfileId,
        },
      });
      dispatch({ type: "SET_ADMIN_MODE", payload: true });
      dispatch({ type: "SET_SUCCESS", payload: "Entered admin mode" });
      void saveConfig({ adminPassword: trimmedPassword }).catch(() => {});
    } catch (err: any) {
      dispatch({
        type: "SET_ERROR",
        payload: err.message || "Admin password verification failed",
      });
      throw err;
    }
  }, [state.workerUrl, state.refreshInterval]);

  const enterAdminModeLocally = useCallback(async (password?: string) => {
    const [latestConfig, workerProfiles, activeWorkerProfileId] = await Promise.all([
      getConfig(),
      getWorkerProfiles(),
      getActiveWorkerProfileId(),
    ]);
    const nextAdminPassword = (password || latestConfig.adminPassword || state.adminPassword).trim();
    if (!latestConfig.workerUrl || !nextAdminPassword) {
      throw new Error("Set the Worker URL and admin password first");
    }
    dispatch({
      type: "SET_CONFIG",
      payload: {
        workerUrl: latestConfig.workerUrl,
        adminPassword: nextAdminPassword,
        sitePassword: latestConfig.sitePassword,
        refreshInterval: Number.isFinite(latestConfig.refreshInterval)
          ? latestConfig.refreshInterval
          : state.refreshInterval,
        workerProfiles,
        activeWorkerProfileId,
      },
    });
    dispatch({ type: "SET_ADMIN_MODE", payload: true });
    dispatch({ type: "SET_SUCCESS", payload: "Entered admin mode" });
  }, [state.adminPassword, state.refreshInterval]);

  const exitAdminMode = useCallback(() => {
    dispatch({ type: "SET_ADMIN_MODE", payload: false });
    dispatch({ type: "SET_SUCCESS", payload: "Left admin mode" });
  }, []);

  // ── Initialize on mount ──
  useEffect(() => {
    let cancelled = false;
    // Fallback: whatever happens inside initialize, force the app into a usable state after at most 8 seconds,
    // so a stuck storage/IO call never leaves the splash screen blank forever.
    const timeoutId = setTimeout(() => {
      if (cancelled) return;
      dispatch({
        type: "INIT",
        payload: {
          workerUrl: "",
          adminPassword: "",
          sitePassword: "",
          refreshInterval: 30,
          isConfigured: false,
          workerProfiles: [],
          activeWorkerProfileId: "",
          accounts: [],
          activeAccountIndex: 0,
          mails: [],
          sentMails: [],
          isAdminMode: false,
        },
      });
    }, 8000);
    initialize().finally(() => {
      cancelled = true;
      clearTimeout(timeoutId);
    });
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [initialize]);

  // ── Site settings are loaded lazily by the screen that needs them.
  // Do not auto-fetch settings during app restore/admin entry: a slow Worker must not block launch.

  // ── Load mails after account switch ──
  useEffect(() => {
    if (
      !state.isInitialized ||
      !state.isConfigured ||
      state.isAdminMode ||
      !activeAccountIdentity
    ) {
      return;
    }
    loadMails();
    loadUserSettings();
  }, [
    activeAccountIdentity,
    loadMails,
    loadUserSettings,
    state.isAdminMode,
    state.isConfigured,
    state.isInitialized,
  ]);

  // ── Auto Refresh Timer ──
  useEffect(() => {
    if (refreshTimerRef.current) {
      clearInterval(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
    if (
      state.isConfigured &&
      !state.isAdminMode &&
      activeAccountIdentity &&
      state.refreshInterval > 0
    ) {
      refreshTimerRef.current = setInterval(() => {
        refreshMails();
      }, state.refreshInterval * 1000);
    }
    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    };
  }, [
    state.isConfigured,
    state.isAdminMode,
    activeAccountIdentity,
    state.refreshInterval,
    refreshMails,
  ]);

  // ── Refresh on app foreground ──
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (
        nextState !== "active" ||
        !state.isInitialized ||
        !state.isConfigured ||
        state.isAdminMode
      ) {
        return;
      }
      if (activeAccount) refreshMails();
    });
    return () => subscription.remove();
  }, [
    activeAccount,
    refreshMails,
    state.isAdminMode,
    state.isConfigured,
    state.isInitialized,
  ]);

  // ── Auto-clear messages ──
  useEffect(() => {
    if (state.error || state.successMessage) {
      const timer = setTimeout(() => {
        dispatch({ type: "CLEAR_MESSAGES" });
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [state.error, state.successMessage]);

  const value: MailContextValue = {
    state,
    initialize,
    updateConfig,
    updateWorkerProfiles,
    saveWorkerProfilesAndEnterAdminLocally,
    switchWorkerProfile,
    reloadWorkerProfiles,
    loadSettings,
    loadUserSettings,
    createNewAddress,
    switchAccount,
    deleteAccount,
    loadMails,
    refreshMails,
    loadSentMails,
    refreshSentMails,
    deleteMailById,
    deleteSentMailById,
    clearInbox,
    clearSentItems,
    sendEmail,
    requestSendMailAccess,
    importByCredential,
    importByPassword,
    changePassword,
    saveAutoReply,
    enterAdminModeLocally,
    enterAdminMode,
    exitAdminMode,
    clearError,
    clearSuccess,
    activeAccount,
  };

  return (
    <MailContext.Provider value={value}>{children}</MailContext.Provider>
  );
}

export function useMail() {
  const ctx = useContext(MailContext);
  if (!ctx) throw new Error("useMail must be used within MailProvider");
  return ctx;
}
