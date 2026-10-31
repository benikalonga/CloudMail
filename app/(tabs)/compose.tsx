import React, { useState, useCallback } from "react";
import {
  Text,
  View,
  TextInput,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  Switch,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { TabSwipeScreen } from "@/components/tab-swipe-screen";
import { Toast } from "@/components/toast";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useMail } from "@/lib/mail-context";
import * as Haptics from "expo-haptics";

export default function ComposeScreen() {
  const colors = useColors();
  const {
    state,
    sendEmail,
    activeAccount,
    clearError,
    clearSuccess,
    requestSendMailAccess,
    loadUserSettings,
  } = useMail();

  const [toMail, setToMail] = useState("");
  const [toName, setToName] = useState("");
  const [fromName, setFromName] = useState("");
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const [isHtml, setIsHtml] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isRequesting, setIsRequesting] = useState(false);

  const sendBalance = state.userSettings?.send_balance;
  const sendMailEnabled = state.settings?.enableSendMail !== false;
  const needsRequestAccess =
    sendMailEnabled && state.userSettings?.fetched && (sendBalance === 0 || sendBalance === undefined);

  const handleRequestAccess = useCallback(async () => {
    setIsRequesting(true);
    try {
      await requestSendMailAccess();
      await loadUserSettings();
    } catch {}
    setIsRequesting(false);
  }, [requestSendMailAccess, loadUserSettings]);

  const handleSend = useCallback(async () => {
    if (!toMail.trim()) {
      return;
    }
    if (!subject.trim() && !content.trim()) {
      return;
    }

    setIsSending(true);
    try {
      await sendEmail({
        from_name: fromName.trim() || activeAccount?.address?.split("@")[0] || "",
        to_name: toName.trim(),
        to_mail: toMail.trim(),
        subject: subject.trim(),
        is_html: isHtml,
        content: content,
      });
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      // Clear form
      setToMail("");
      setToName("");
      setFromName("");
      setSubject("");
      setContent("");
    } catch {
      // Error handled by context
    } finally {
      setIsSending(false);
      // Refresh send_balance after sending
      loadUserSettings();
    }
  }, [toMail, toName, fromName, subject, content, isHtml, sendEmail, activeAccount, loadUserSettings]);

  if (!state.isConfigured) {
    return (
      <TabSwipeScreen tab="compose">
        <ScreenContainer>
          <View style={styles.emptyContainer}>
            <IconSymbol name="gearshape.fill" size={56} color={colors.muted} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              Set up a server first
            </Text>
            <Text style={[styles.emptySubtitle, { color: colors.muted }]}>
              Enter the Worker URL in Settings
            </Text>
          </View>
        </ScreenContainer>
      </TabSwipeScreen>
    );
  }

  if (!activeAccount) {
    return (
      <TabSwipeScreen tab="compose">
        <ScreenContainer>
          <View style={styles.emptyContainer}>
            <IconSymbol name="at" size={56} color={colors.muted} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              Create a mailbox first
            </Text>
            <Text style={[styles.emptySubtitle, { color: colors.muted }]}>
              Create an email address under Mailboxes
            </Text>
          </View>
        </ScreenContainer>
      </TabSwipeScreen>
    );
  }

  return (
    <TabSwipeScreen tab="compose">
      <ScreenContainer>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>
            Send email
          </Text>
          <Pressable
            onPress={handleSend}
            disabled={isSending || !toMail.trim()}
            style={({ pressed }) => [
              styles.sendButton,
              {
                backgroundColor:
                  isSending || !toMail.trim()
                    ? colors.muted
                    : colors.primary,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            {isSending ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <IconSymbol name="paperplane.fill" size={16} color="#FFFFFF" />
                <Text style={styles.sendButtonText}>Send</Text>
              </>
            )}
          </Pressable>
        </View>

        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.formContainer}
          keyboardShouldPersistTaps="handled"
        >
          {/* Send balance / access banner */}
          {!sendMailEnabled ? (
            <View
              style={[
                styles.banner,
                { backgroundColor: `${colors.warning}15`, borderColor: colors.warning },
              ]}
            >
              <IconSymbol
                name="exclamationmark.triangle.fill"
                size={16}
                color={colors.warning}
              />
              <Text style={[styles.bannerText, { color: colors.foreground }]}>
                Sending is not enabled on the server (enableSendMail=false)
              </Text>
            </View>
          ) : needsRequestAccess ? (
            <View
              style={[
                styles.banner,
                { backgroundColor: `${colors.warning}15`, borderColor: colors.warning },
              ]}
            >
              <IconSymbol name="info.circle.fill" size={16} color={colors.warning} />
              <Text style={[styles.bannerText, { color: colors.foreground }]}>
                Your send balance is 0. Tap the button on the right to request send access
              </Text>
              <Pressable
                onPress={handleRequestAccess}
                disabled={isRequesting}
                style={({ pressed }) => [
                  styles.bannerAction,
                  {
                    backgroundColor: colors.warning,
                    opacity: pressed || isRequesting ? 0.7 : 1,
                  },
                ]}
              >
                {isRequesting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.bannerActionText}>Request</Text>
                )}
              </Pressable>
            </View>
          ) : sendBalance !== undefined ? (
            <View
              style={[
                styles.banner,
                { backgroundColor: `${colors.primary}10`, borderColor: colors.primary },
              ]}
            >
              <IconSymbol name="checkmark.circle.fill" size={16} color={colors.primary} />
              <Text style={[styles.bannerText, { color: colors.foreground }]}>
                Send balance: {sendBalance}
              </Text>
            </View>
          ) : null}

          {/* From */}
          <View style={[styles.fieldRow, { borderBottomColor: colors.border }]}>
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>From</Text>
            <Text style={[styles.fromAddress, { color: colors.foreground }]} numberOfLines={1}>
              {activeAccount.address}
            </Text>
          </View>

          {/* From Name */}
          <View style={[styles.fieldRow, { borderBottomColor: colors.border }]}>
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>From name</Text>
            <TextInput
              style={[styles.fieldInput, { color: colors.foreground }]}
              value={fromName}
              onChangeText={setFromName}
              placeholder="Display name (optional)"
              placeholderTextColor={colors.muted}
              returnKeyType="next"
            />
          </View>

          {/* To */}
          <View style={[styles.fieldRow, { borderBottomColor: colors.border }]}>
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>To</Text>
            <TextInput
              style={[styles.fieldInput, { color: colors.foreground }]}
              value={toMail}
              onChangeText={setToMail}
              placeholder="email@example.com"
              placeholderTextColor={colors.muted}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
            />
          </View>

          {/* To Name */}
          <View style={[styles.fieldRow, { borderBottomColor: colors.border }]}>
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>To name</Text>
            <TextInput
              style={[styles.fieldInput, { color: colors.foreground }]}
              value={toName}
              onChangeText={setToName}
              placeholder="Recipient name (optional)"
              placeholderTextColor={colors.muted}
              returnKeyType="next"
            />
          </View>

          {/* Subject */}
          <View style={[styles.fieldRow, { borderBottomColor: colors.border }]}>
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>Subject</Text>
            <TextInput
              style={[styles.fieldInput, { color: colors.foreground }]}
              value={subject}
              onChangeText={setSubject}
              placeholder="Email subject"
              placeholderTextColor={colors.muted}
              returnKeyType="next"
            />
          </View>

          {/* HTML Toggle */}
          <View style={[styles.toggleRow, { borderBottomColor: colors.border }]}>
            <Text style={[styles.toggleLabel, { color: colors.muted }]}>
              HTML format
            </Text>
            <Switch
              value={isHtml}
              onValueChange={setIsHtml}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#FFFFFF"
            />
          </View>

          {/* Content */}
          <TextInput
            style={[
              styles.contentInput,
              {
                color: colors.foreground,
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}
            value={content}
            onChangeText={setContent}
            placeholder={isHtml ? "<p>HTML email content</p>" : "Email body..."}
            placeholderTextColor={colors.muted}
            multiline
            textAlignVertical="top"
          />
        </ScrollView>
        </KeyboardAvoidingView>

        <Toast message={state.error} type="error" onDismiss={clearError} />
        <Toast message={state.successMessage} type="success" onDismiss={clearSuccess} />
      </ScreenContainer>
    </TabSwipeScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  sendButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  sendButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  formContainer: {
    paddingBottom: 40,
  },
  fieldRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: "500",
    width: 56,
  },
  fieldInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 0,
    lineHeight: 20,
  },
  fromAddress: {
    flex: 1,
    fontSize: 15,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: 0.5,
  },
  toggleLabel: {
    fontSize: 14,
    fontWeight: "500",
  },
  contentInput: {
    margin: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    fontSize: 15,
    lineHeight: 22,
    minHeight: 200,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "600",
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    marginTop: 8,
    textAlign: "center",
    lineHeight: 20,
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  bannerText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  bannerAction: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 14,
    minWidth: 52,
    alignItems: "center",
  },
  bannerActionText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "600",
  },
});
