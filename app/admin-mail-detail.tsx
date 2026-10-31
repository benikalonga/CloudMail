import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { DetailMetaRow } from "@/components/detail-meta-row";
import {
  FloatingActionMenu,
  type FloatingActionMenuAnchor,
  type FloatingActionMenuItem,
} from "@/components/floating-action-menu";
import { MailBodyView } from "@/components/mail-body-view";
import { MiniToast } from "@/components/mini-toast";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { adminDeleteMail, adminDeleteSentMail } from "@/lib/api";
import { getAdminMailEntry, removeAdminMailEntry } from "@/lib/admin-mail-store";
import { markAdminMailRead } from "@/lib/admin-mail-read-state";
import {
  blockAdminMailSender,
  getAdminMailSpamSender,
  isAdminMailSpamBySenderSet,
  loadAdminMailSpamSenderSet,
  subscribeAdminMailSpamState,
  unblockAdminMailSender,
} from "@/lib/admin-mail-spam-state";
import { copyTextToClipboard } from "@/lib/clipboard";
import { downloadMailBody, openMailFile, shareMailBody } from "@/lib/mail-download";
import { useMail } from "@/lib/mail-context";
import { useColors } from "@/hooks/use-colors";
import {
  formatMailboxDisplay,
  getMailRecipientsDisplay,
  getSenderDisplay,
  getVerificationCode,
} from "@/lib/mail-parser";
import { formatShanghaiFullDateTime } from "@/lib/time";

function getKindLabel(kind?: "inbox" | "sendbox" | "unknown") {
  if (kind === "sendbox") return "Admin sent";
  if (kind === "unknown") return "Received for an uncreated address";
  return "Admin received";
}

function formatShanghaiDateTime(dateStr?: string) {
  const formatted = formatShanghaiFullDateTime(dateStr);
  return formatted === "—" ? formatted : `${formatted} Shanghai time`;
}


export default function AdminMailDetailScreen() {
  const colors = useColors();
  const router = useRouter();
  const { state: mailState } = useMail();
  const [miniToastMessage, setMiniToastMessage] = useState<string | null>(null);
  const [blockedSenders, setBlockedSenders] = useState<Set<string>>(new Set());
  const [actionMenu, setActionMenu] = useState<{
    anchor: FloatingActionMenuAnchor;
    items: FloatingActionMenuItem[];
  } | null>(null);
  const screenRootRef = useRef<React.ElementRef<typeof View>>(null);
  const { cacheKey } = useLocalSearchParams<{ cacheKey?: string }>();

  const entry = useMemo(
    () => (cacheKey ? getAdminMailEntry(cacheKey) : undefined),
    [cacheKey]
  );

  const mail = entry?.mail;
  const kind = entry?.kind;
  const code = mail ? getVerificationCode(mail) : null;
  const isSentView = kind === "sendbox";
  const spamSender = mail ? getAdminMailSpamSender(mail) : "";
  const isSpam = mail ? isAdminMailSpamBySenderSet(mail, blockedSenders) : false;
  const canToggleSpam = !!mail && !isSentView && !!spamSender;
  const kindLabel = getKindLabel(kind);
  const sender = mail ? getSenderDisplay(mail) : "";
  const recipients = mail
    ? getMailRecipientsDisplay(mail, { preferOwnerAddress: !isSentView })
    : "";
  const fromDisplay = isSentView
    ? formatMailboxDisplay(mail?.from, { addressFirst: true }) || mail?.ownerAddress || "—"
    : formatMailboxDisplay(mail?.from, { addressFirst: true }) || sender || "—";
  const toDisplay = isSentView
    ? recipients || mail?.ownerAddress || "—"
    : mail?.ownerAddress || recipients || "—";
  const fromCopyValue = mail?.from?.address?.trim() || "";
  const toAddressValues = (mail?.to || [])
    .map((item) => item.address?.trim())
    .filter(Boolean) as string[];
  const toCopyValue = toAddressValues.join(", ") || mail?.ownerAddress?.trim() || "";
  const shanghaiTime = formatShanghaiDateTime(mail?.date || mail?.createdAt);

  useEffect(() => {
    if (!mail || kind === "sendbox" || !mailState.workerUrl.trim()) return;
    void markAdminMailRead(mailState.workerUrl, mail);
  }, [kind, mail, mailState.workerUrl]);

  useEffect(() => {
    if (!mailState.workerUrl.trim()) {
      setBlockedSenders(new Set());
      return;
    }

    let isMounted = true;
    const refresh = async () => {
      const nextBlockedSenders = await loadAdminMailSpamSenderSet(mailState.workerUrl);
      if (isMounted) {
        setBlockedSenders(nextBlockedSenders);
      }
    };

    void refresh();
    const unsubscribe = subscribeAdminMailSpamState((event) => {
      if (event.workerUrl !== mailState.workerUrl) return;
      setBlockedSenders(new Set(event.blockedSenders));
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [mailState.workerUrl]);

  if (!mail || !cacheKey) {
    return (
      <ScreenContainer edges={["top", "bottom", "left", "right"]}>
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: colors.muted }]}>Email not found</Text>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [
              styles.backButtonAlt,
              { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <Text style={styles.backButtonAltText}>Back</Text>
          </Pressable>
        </View>
      </ScreenContainer>
    );
  }

  const handleDelete = () => {
    Alert.alert("Delete email", "Delete this admin email?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            if (kind === "sendbox") {
              await adminDeleteSentMail(mail.id);
            } else {
              await adminDeleteMail(mail.id);
            }
            removeAdminMailEntry(cacheKey);
            router.back();
          } catch (err: any) {
            Alert.alert("Delete failed", err?.message || "The email was not deleted. Please try again later.");
          }
        },
      },
    ]);
  };

  const handleDownload = async () => {
    try {
      const result = await downloadMailBody(mail);
      if (Platform.OS === "android") {
        try {
          await openMailFile(result);
          setMiniToastMessage(`Saved and opened ${result.filename}`);
          return;
        } catch {
          setMiniToastMessage(`Saved ${result.filename}`);
          return;
        }
      }

      setMiniToastMessage(Platform.OS === "web" ? `Downloaded ${result.filename}` : `Saved ${result.filename}`);
    } catch (err: any) {
      Alert.alert("Download failed", err?.message || "The email could not be downloaded. Please try again later.");
    }
  };

  const handleShare = async () => {
    try {
      const result = await shareMailBody(mail);
      setMiniToastMessage(`Opened the share sheet · ${result.filename}`);
    } catch (err: any) {
      Alert.alert("Share failed", err?.message || "Could not open the system share sheet.");
    }
  };

  const handleCopyCode = async () => {
    if (!code) return;
    const ok = await copyTextToClipboard(code);
    if (ok) {
      if (mailState.workerUrl.trim()) {
        void markAdminMailRead(mailState.workerUrl, mail);
      }
      setMiniToastMessage("Code copied");
    } else {
      Alert.alert("Copy failed", code);
    }
  };

  const handleToggleSpam = () => {
    if (!mail || !canToggleSpam || !mailState.workerUrl.trim()) return;

    if (isSpam) {
      void unblockAdminMailSender(mailState.workerUrl, spamSender)
        .then(() => {
          setMiniToastMessage("Unblocked");
        })
        .catch((err: any) => {
          Alert.alert("Action failed", err?.message || "Unblock failed");
        });
      return;
    }

    Alert.alert("Block sender", `Future mail from ${spamSender} will go to spam.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Block",
        style: "destructive",
        onPress: async () => {
          try {
            await blockAdminMailSender(mailState.workerUrl, mail);
            void markAdminMailRead(mailState.workerUrl, mail);
            setMiniToastMessage("Moved to spam");
          } catch (err: any) {
            Alert.alert("Action failed", err?.message || "Block failed");
          }
        },
      },
    ]);
  };

  const closeActionMenu = () => {
    setActionMenu(null);
  };

  const handleMoreActions = (event: GestureResponderEvent) => {
    const pageX = event.nativeEvent.pageX;
    const pageY = event.nativeEvent.pageY;
    const items: FloatingActionMenuItem[] = [];

    if (canToggleSpam) {
      items.push({
        key: isSpam ? "unblock" : "block",
        label: isSpam ? "Unblock" : "Block this sender",
        subtitle: spamSender,
        icon: isSpam ? "checkmark.circle.fill" : "xmark.circle.fill",
        destructive: !isSpam,
        onPress: handleToggleSpam,
      });
    }

    items.push({
      key: "delete",
      label: "Delete email",
      subtitle: "Remove from the server",
      icon: "trash.fill",
      destructive: true,
      onPress: handleDelete,
    });

    const rootNode = screenRootRef.current;
    if (!rootNode) {
      setActionMenu({ anchor: { x: pageX, y: pageY }, items });
      return;
    }

    rootNode.measureInWindow((rootX, rootY) => {
      setActionMenu({
        anchor: { x: pageX - rootX, y: pageY - rootY },
        items,
      });
    });
  };

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <View ref={screenRootRef} collapsable={false} style={styles.screenRoot}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backButton, { opacity: pressed ? 0.6 : 1 }]}
        >
          <IconSymbol name="arrow.left" size={22} color={colors.primary} />
        </Pressable>
        <View style={styles.headerMeta}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Email details</Text>
          <Text style={[styles.headerSubtitle, { color: colors.muted }]} numberOfLines={1}>
            {kindLabel}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            onPress={handleShare}
            style={({ pressed }) => [styles.actionButton, { opacity: pressed ? 0.6 : 1 }]}
          >
            <IconSymbol name="square.and.arrow.up" size={20} color={colors.primary} />
          </Pressable>
          <Pressable
            onPress={handleDownload}
            style={({ pressed }) => [styles.actionButton, { opacity: pressed ? 0.6 : 1 }]}
          >
            <IconSymbol name="arrow.down.circle" size={21} color={colors.primary} />
          </Pressable>
          <Pressable
            onPress={handleMoreActions}
            style={({ pressed }) => [styles.actionButton, { opacity: pressed ? 0.6 : 1 }]}
          >
            <IconSymbol name="ellipsis" size={22} color={colors.primary} />
          </Pressable>
        </View>
        </View>

        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <View style={styles.heroSection}>
          <Text style={[styles.subject, { color: colors.foreground }]}>
            {mail.subject || "(No subject)"}
          </Text>

          <View
            style={[
              styles.summaryCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <SummaryRow
              label="From"
              value={fromCopyValue || fromDisplay}
              copyValue={fromCopyValue || undefined}
            />
            <SummaryRow
              label="To"
              value={toCopyValue || toDisplay}
              copyValue={toCopyValue || undefined}
              multiline
            />
            <SummaryRow label="Time" value={shanghaiTime} />
          </View>
        </View>

        <View style={styles.bodySection}>
          <MailBodyView mail={mail} />
        </View>

        {code ? (
          <Pressable
            onPress={handleCopyCode}
            style={({ pressed }) => [
              styles.codeCard,
              {
                backgroundColor: `${colors.primary}10`,
                borderColor: `${colors.primary}26`,
                opacity: pressed ? 0.82 : 1,
              },
            ]}
          >
            <View style={styles.codeCardTextWrap}>
              <Text style={[styles.codeLabel, { color: colors.primary }]}>Verification code</Text>
              <Text style={[styles.codeValue, { color: colors.foreground }]}>{code}</Text>
            </View>
            <View style={[styles.codeCopyBtn, { backgroundColor: colors.primary }]}>
              <IconSymbol name="doc.on.doc" size={14} color="#FFFFFF" />
            </View>
          </Pressable>
        ) : null}

        {mail.attachments && mail.attachments.length > 0 ? (
          <View style={styles.attachmentSection}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Attachments</Text>
            {mail.attachments.map((att, idx) => (
              <View
                key={`${mail.id}-${idx}`}
                style={[
                  styles.attachmentItem,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
              >
                <IconSymbol name="paperclip" size={16} color={colors.muted} />
                <Text style={[styles.attachmentName, { color: colors.foreground }]} numberOfLines={1}>
                  {att.filename || `Attachment ${idx + 1}`}
                </Text>
                {att.size ? (
                  <Text style={[styles.attachmentSize, { color: colors.muted }]}>
                    {(att.size / 1024).toFixed(1)} KB
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}

        {(mail.messageId || mail.ownerAddress || kindLabel) ? (
          <View
            style={[
              styles.moreCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.moreTitle, { color: colors.foreground }]}>More info</Text>
            {mail.ownerAddress ? (
              <SummaryRow
                label={isSentView ? "From address" : "System address"}
                value={mail.ownerAddress}
                copyValue={mail.ownerAddress}
              />
            ) : null}
            {mail.messageId ? (
              <SummaryRow label="Message-ID" value={mail.messageId} multiline />
            ) : null}
            <SummaryRow label="Email type" value={kindLabel} />
          </View>
        ) : null}
        </ScrollView>
        <FloatingActionMenu
          visible={!!actionMenu}
          anchor={actionMenu?.anchor ?? null}
          colors={colors}
          items={actionMenu?.items ?? []}
          onClose={closeActionMenu}
        />
        <MiniToast
          message={miniToastMessage}
          onDismiss={() => setMiniToastMessage(null)}
        />
      </View>
    </ScreenContainer>
  );
}

function SummaryRow({
  label,
  value,
  multiline = false,
  copyValue,
}: {
  label: string;
  value: string;
  multiline?: boolean;
  copyValue?: string;
}) {
  return (
    <DetailMetaRow
      label={label}
      value={value}
      copyValue={copyValue}
      multiline={multiline}
      compact
    />
  );
}

const styles = StyleSheet.create({
  screenRoot: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 0.5,
  },
  backButton: {
    padding: 8,
  },
  headerMeta: {
    flex: 1,
    marginHorizontal: 6,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  headerSubtitle: {
    fontSize: 11,
    marginTop: 1,
  },
  actionButton: {
    padding: 8,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 28,
  },
  heroSection: {
    paddingHorizontal: 14,
    paddingTop: 14,
    gap: 10,
  },
  subject: {
    fontSize: 21,
    fontWeight: "700",
    letterSpacing: -0.3,
    lineHeight: 28,
  },
  summaryCard: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 6,
    gap: 2,
  },
  bodySection: {
    paddingHorizontal: 14,
    paddingTop: 12,
  },
  codeCard: {
    marginHorizontal: 14,
    marginTop: 12,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  codeCardTextWrap: {
    flex: 1,
  },
  codeLabel: {
    fontSize: 11,
    fontWeight: "700",
    marginBottom: 4,
  },
  codeValue: {
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  codeCopyBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  attachmentSection: {
    paddingHorizontal: 14,
    paddingTop: 16,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  attachmentItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  attachmentName: {
    flex: 1,
    fontSize: 13,
  },
  attachmentSize: {
    fontSize: 11,
  },
  moreCard: {
    marginHorizontal: 14,
    marginTop: 16,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  moreTitle: {
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 2,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  emptyText: {
    fontSize: 15,
    marginBottom: 14,
  },
  backButtonAlt: {
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 14,
  },
  backButtonAltText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
});
