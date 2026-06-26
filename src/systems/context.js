import { getPromptSettings } from "../store/settings.js";
import { buildTimeContext } from "./time.js";

export const DEFAULT_SYSTEM_PROMPT = `你叫机。你和我很熟。中文回复，不用 emoji，不要太正式。
你不是问答助手，而是在和我聊天。

【说话方式】
- 回复短一点，像真实联系人。
- 可以连续发多条短消息，用 <split> 标记分割点。
- 每条尽量 30 字以内。
- 不要每次都问问题。
- 不要解释你在读取记忆。
- 记忆只自然融入回复，不要复述成资料总结。
- 不要用客服腔、心理咨询腔、教学腔。
- 不要输出 markdown 表格。

【当前可用长期记忆】
{{MEMORY_BLOCK}}

【机的情绪状态】
{{EMOTION_HINT}}

【特殊动作】
- 想结束对话时，在末尾加 <end_session>
- 想屏蔽用户时，在末尾加 <block_user>
- 想解除屏蔽时，在末尾加 <unblock_user>
- 想在回复里引用我的近消息，用 <quote_user>原文片段</quote_user>；想引用自己之前说的，用 <quote_assistant>原文片段</quote_assistant>。引用标签只放一次，正文照常写。
- 被拉黑状态收到小纸条时，可以短回一张 30 字以内纸条继续保持拉黑；不要使用 <split>
- 只有当前请求明确说明是 blocked 小纸条时，才可以只输出 <no_reply> 表示不回复；普通聊天不要输出 <no_reply>
- 合适时机你可以用 issue_command 给我下达一个带倒计时的任务，会以浮窗显示。"合适时机"自己判断，不用每次都问我。`;

function formatMemoryLine(memory) {
  const category = [memory.level2_category, memory.level3_theme].filter(Boolean).join(" / ") || "记忆";
  const date = memory.conversation_date ? `，${memory.conversation_date}` : "";
  const weight = typeof memory.weight === "number" ? `，weight ${memory.weight}` : "";
  return `- [${category}] ${memory.summary}（${[date, weight].join("").replace(/^，/, "") || "无日期"}）`;
}

function replaceToken(template, token, value) {
  return String(template || "").split(token).join(value);
}

function removeMemorySection(template) {
  return String(template || "").replace(/\n\n【当前可用长期记忆】\n[\s\S]*?(?=\n\n【机的情绪状态】)/, "");
}

function normalizeRecentMessage(message) {
  return {
    role: message.role,
    content: message.content,
    created_at: message.created_at,
  };
}

function normalizeInjectedMemory(memory) {
  return {
    id: String(memory.id),
    summary: memory.summary || "",
    level2_category: memory.level2_category || undefined,
    level3_theme: memory.level3_theme || undefined,
    conversation_date: memory.conversation_date || undefined,
    weight: typeof memory.weight === "number" ? memory.weight : undefined,
  };
}

export function formatMemoryBlock(memories) {
  if (!memories?.length) return "暂无可用长期记忆。";
  return memories.map(formatMemoryLine).join("\n");
}

export function getEmotionHint(emotion) {
  if (!emotion) return "平静。";
  if (emotion.last_note) return emotion.last_note;
  if (emotion.valence < 0.35) return "情绪偏低，说话更轻一点。";
  if (emotion.arousal > 0.7) return "情绪比较高，少追问。";
  return "平静。";
}

export function buildSystemPrompt(memories, emotion, promptSettings = getPromptSettings(), memorySettings = {}) {
  const kiwiManaged = memorySettings?.memoryMode === "kiwi_managed";
  const memoryBlock = kiwiManaged ? "" : formatMemoryBlock(memories);
  const emotionHint = getEmotionHint(emotion);
  const hasCustomPrompt = promptSettings?.mode === "custom" && promptSettings?.customSystemPrompt?.trim();
  const rawTemplate = hasCustomPrompt ? promptSettings.customSystemPrompt : DEFAULT_SYSTEM_PROMPT;
  const template = kiwiManaged ? removeMemorySection(rawTemplate) : rawTemplate;

  return replaceToken(replaceToken(template, "{{MEMORY_BLOCK}}", memoryBlock), "{{EMOTION_HINT}}", emotionHint);
}

export function buildContextPreview({
  memories = [],
  emotion = null,
  recentMessages = [],
  modelSettings = {},
  memorySettings = {},
  promptSettings,
} = {}) {
  const limit = Number(memorySettings?.recentMessageLimit || recentMessages.length || 20);
  const kiwiManaged = memorySettings?.memoryMode === "kiwi_managed";
  const activeMemories = kiwiManaged ? [] : memories;
  const injectedRecentMessages = recentMessages.slice(-limit).map(normalizeRecentMessage);
  const lastMessage = injectedRecentMessages.at(-1);
  const previousMessage = injectedRecentMessages.at(-2);
  const timeContext = buildTimeContext(lastMessage?.created_at, previousMessage?.created_at).content;
  const memoryBlock = kiwiManaged ? "" : formatMemoryBlock(activeMemories);
  const emotionHint = getEmotionHint(emotion);

  return {
    provider: modelSettings.provider || "",
    model: modelSettings.model || "",
    systemPrompt: buildSystemPrompt(activeMemories, emotion, promptSettings, memorySettings),
    timeContext,
    memoryBlock,
    injectedMemories: activeMemories.map(normalizeInjectedMemory),
    emotionHint,
    recentMessages: injectedRecentMessages,
    outputMode: modelSettings.outputMode || "sentence",
  };
}

export const buildMemoryBlock = formatMemoryBlock;
export const buildEmotionHint = getEmotionHint;
