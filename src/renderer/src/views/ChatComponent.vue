<template>
  <div class="chat-app-container">
    <div class="sidebar">
      <button class="new-chat-btn" @click="startNewConversation">+ 新建对话</button>
      <div class="conversation-list">
        <div
          v-for="conv in conversations"
          :key="conv.id"
          :class="['conversation-item', { active: conv.id === currentConversationId }]"
          @click="selectConversation(conv.id)"
          :title="conv.title"
        >
          {{ conv.title || '新对话 ' + conv.id.substring(0, 4) }}
        </div>
      </div>
    </div>

    <div class="chat-container">
      <h2>{{ currentConversation?.title || 'Gemini 聊天' }}</h2>
      <div class="message-area" ref="messageAreaRef">
        <div
          v-for="(message, index) in currentMessages"
          :key="`${currentConversationId}-${index}`"
          :class="['message', message.role === 'user' ? 'user-message' : 'model-message']"
        >
          <div class="message-content">
            <strong>{{ message.role === 'user' ? '你' : 'Gemini' }}:</strong>
            <div
              v-if="message.role === 'model'"
              class="markdown-body"
              v-html="renderMarkdown(message.parts.map((part) => part.text).join(''))"
            ></div>
            <pre v-else class="message-text">{{
              message.parts.map((part) => part.text).join('')
            }}</pre>
          </div>
        </div>
        <div v-if="isLoading && !streamingUpdate" class="message model-message">
          <div class="message-content">
            <strong>Gemini:</strong>
            <span class="loading-dots">思考中...</span>
          </div>
        </div>
      </div>
      <div v-if="error" class="error-message">
        <p>错误: {{ error }}</p>
      </div>

      <div class="input-wrapper">
        <button
          v-if="isLoading && streamingUpdate"
          @click="stopStreaming"
          class="stop-btn"
          title="停止生成"
        >
          &#9632;
        </button>
        <div class="input-area">
          <textarea
            v-model="currentInput"
            placeholder="输入你的消息..."
            @keyup.enter.prevent="sendMessage"
            :disabled="isLoading"
            rows="1"
            @input="autoGrowTextarea"
            ref="textareaRef"
          ></textarea>
          <button
            @click="sendMessage"
            :disabled="isLoading || !currentInput.trim()"
            title="发送消息"
          >
            <svg
              v-if="!isLoading"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              width="18"
              height="18"
            >
              <path
                d="M3.478 2.405a.75.75 0 0 0-.926.94l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.405Z"
              />
            </svg>
            <span v-else>...</span>
          </button>
        </div>
      </div>

      <div class="api-key-warning">
        <strong>警告:</strong> 此演示代码可能暴露 API 密钥
        (如果未正确配置)。生产环境中使用后端代理。
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick, watch, computed } from 'vue'
import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
  ChatSession,
  GenerateContentStreamResult,
  Content // 确保导入 Content
} from '@google/generative-ai'
import { v4 as uuidv4 } from 'uuid' // 用于生成唯一 ID
import MarkdownIt from 'markdown-it' // 引入 markdown-it

// --- 类型定义 ---
interface MessagePart {
  text: string
}
interface Message {
  role: 'user' | 'model'
  parts: MessagePart[]
}
interface Conversation {
  id: string
  title: string
  messages: Message[] // 使用 Message 类型
}

// --- 配置 ---
const API_KEY =  ''
const MODEL_NAME = 'gemini-2.5-flash-preview-04-17'
const LOCAL_STORAGE_KEY = 'gemini-chat-conversations'

// --- Markdown 解析器实例 ---
const md = new MarkdownIt({
  html: false, // 安全起见，禁用原始 HTML
  breaks: true, // 将 \n 转换成 <br>
  linkify: true, // 自动识别链接
  typographer: true // 启用一些标点符号和引用的美化
})

// --- 响应式状态 ---
const conversations = ref<Conversation[]>([])
const currentConversationId = ref<string | null>(null)
const currentInput = ref('')
const isLoading = ref(false)
const error = ref<string | null>(null)
const messageAreaRef = ref<HTMLElement | null>(null)
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const streamingUpdate = ref(false)
const isStopping = ref(false) // 控制是否用户请求停止

// --- Gemini API 实例 ---
let genAI: GoogleGenerativeAI | null = null
let activeChatSession: ChatSession | null = null

// --- 计算属性 ---
const currentConversation = computed(() => {
  return conversations.value.find((conv) => conv.id === currentConversationId.value) || null
})

const currentMessages = computed((): Message[] => {
  return currentConversation.value?.messages || []
})

// --- 方法 ---

// Markdown 渲染函数
const renderMarkdown = (text: string): string => {
  // 基本渲染，后续可以加 sanitization 或 syntax highlighting
  return md.render(text || '')
}

// 滚动到底部
const scrollToBottom = async () => {
  await nextTick()
  if (messageAreaRef.value) {
    messageAreaRef.value.scrollTop = messageAreaRef.value.scrollHeight
  }
}

// 自动调整 textarea 高度
const autoGrowTextarea = () => {
  if (textareaRef.value) {
    textareaRef.value.style.height = 'auto'
    textareaRef.value.style.height = `${textareaRef.value.scrollHeight}px`
  }
}

// 保存对话到 localStorage
const saveConversations = () => {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(conversations.value))
  } catch (e) {
    console.error('保存对话失败:', e)
    error.value = '无法保存对话记录，可能是存储空间已满。'
  }
}

// 从 localStorage 加载对话
const loadConversations = () => {
  try {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY)
    if (saved) {
      conversations.value = JSON.parse(saved)
    }
    // 如果没有对话记录，或者没有选中的对话，则开始一个新对话
    if (conversations.value.length === 0) {
      startNewConversation()
    } else if (!currentConversationId.value && conversations.value.length > 0) {
      // 默认选中最后一个对话
      selectConversation(conversations.value[conversations.value.length - 1].id)
    } else if (
      currentConversationId.value &&
      !conversations.value.find((c) => c.id === currentConversationId.value)
    ) {
      // 如果当前选中的 ID 无效，选择最后一个
      selectConversation(conversations.value[conversations.value.length - 1].id)
    } else if (currentConversationId.value) {
      // 如果当前 ID 有效，确保加载它
      selectConversation(currentConversationId.value)
    }
  } catch (e) {
    console.error('加载对话失败:', e)
    localStorage.removeItem(LOCAL_STORAGE_KEY) // 清理损坏的数据
    conversations.value = []
    startNewConversation()
    error.value = '无法加载之前的对话记录。'
  }
}

// 初始化 Gemini 客户端
const initializeGemini = () => {
  if (!API_KEY || API_KEY === 'YOUR_API_KEY') {
    error.value = '请设置有效的 Gemini API Key (环境变量或代码内占位符)'
    console.error('API Key not set!')
    return false
  }
  try {
    genAI = new GoogleGenerativeAI(API_KEY)
    return true
  } catch (err: any) {
    console.error('初始化 Gemini 出错:', err)
    error.value = `初始化 Gemini API 失败: ${err.message || err}`
    return false
  }
}

// 准备或重新初始化当前对话的 ChatSession
const prepareChatSession = () => {
  if (!genAI || !currentConversation.value) {
    console.error('Gemini 未初始化或无当前对话')
    activeChatSession = null
    return
  }
  const model = genAI.getGenerativeModel({
    model: MODEL_NAME
    // safetySettings: [...] // 可选配置
    // generationConfig: {...} // 可选配置
  })

  // 从当前对话的消息历史初始化
  // 需要将 Message[] 转换为 Content[]
  const history: Content[] = currentConversation.value.messages
    .filter((msg) => msg.parts.some((part) => part.text.trim() !== '')) // 过滤掉完全空的消息
    .map((msg) => ({
      role: msg.role,
      parts: msg.parts
    }))

  console.log(
    `为对话 ${currentConversation.value.id} 准备 ChatSession，历史消息数: ${history.length}`
  )
  activeChatSession = model.startChat({ history })
}

// 开始新对话
const startNewConversation = () => {
  if (!genAI) return // 确保已初始化
  const newId = uuidv4()
  const newConversation: Conversation = {
    id: newId,
    title: `新对话 ${new Date().toLocaleTimeString()}`, // 临时标题
    messages: []
  }
  conversations.value.unshift(newConversation) // 添加到列表顶部
  selectConversation(newId) // 选中新对话
}

// 选中对话
const selectConversation = (id: string) => {
  if (currentConversationId.value === id && activeChatSession) {
    // 如果已经是当前对话且 session 存在，则无需操作
    return
  }
  console.log(`选择对话: ${id}`)
  currentConversationId.value = id
  error.value = null // 清除错误
  currentInput.value = '' // 清空输入框
  isLoading.value = false // 重置加载状态
  streamingUpdate.value = false
  isStopping.value = false
  prepareChatSession() // 为选中的对话准备 ChatSession
  nextTick(() => scrollToBottom()) // 滚动到底部
}

// 发送消息
const sendMessage = async () => {
  if (
    !currentInput.value.trim() ||
    isLoading.value ||
    !activeChatSession ||
    !currentConversation.value
  ) {
    if (!activeChatSession) error.value = '聊天会话未初始化。'
    return
  }

  const inputText = currentInput.value.trim()
  const userMessage: Message = { role: 'user', parts: [{ text: inputText }] }
  const currentConvIndex = conversations.value.findIndex(
    (c) => c.id === currentConversationId.value
  )

  if (currentConvIndex === -1) return // 安全检查

  // 更新当前对话的消息列表
  conversations.value[currentConvIndex].messages.push(userMessage)

  // 如果是这个对话的第一条用户消息，尝试生成标题
  if (
    conversations.value[currentConvIndex].messages.filter((m) => m.role === 'user').length === 1
  ) {
    conversations.value[currentConvIndex].title =
      inputText.substring(0, 30) + (inputText.length > 30 ? '...' : '')
  }

  currentInput.value = ''
  if (textareaRef.value) textareaRef.value.style.height = 'auto'
  isLoading.value = true
  streamingUpdate.value = false
  isStopping.value = false // 重置停止标志
  error.value = null
  await scrollToBottom()

  const modelResponsePlaceholder: Message = { role: 'model', parts: [{ text: '' }] }
  conversations.value[currentConvIndex].messages.push(modelResponsePlaceholder)
  const modelMessageIndex = conversations.value[currentConvIndex].messages.length - 1

  try {
    const result: GenerateContentStreamResult = await activeChatSession.sendMessageStream(inputText)
    streamingUpdate.value = true // 开始流式更新

    let accumulatedText = ''
    for await (const chunk of result.stream) {
      if (isStopping.value) {
        // 检查用户是否请求停止
        console.log('用户请求停止流式响应')
        error.value = '已停止生成响应。'
        break // 跳出循环
      }

      if (chunk && typeof chunk.text === 'function') {
        const chunkText = chunk.text()
        accumulatedText += chunkText
        // 实时更新模型消息占位符
        conversations.value[currentConvIndex].messages[modelMessageIndex].parts = [
          { text: accumulatedText }
        ]
        await scrollToBottom()
      } else {
        console.warn('收到缺少 text 函数的流数据块:', chunk)
      }
    }

    // 如果是因为停止而退出循环，可能需要处理最后的消息状态
    if (isStopping.value) {
      // 可以选择保留部分生成的内容，或者清空/标记为已中断
      if (accumulatedText === '') {
        // 如果刚开始就停止了，移除占位符
        conversations.value[currentConvIndex].messages.pop()
      } else {
        // 保留已收到的部分
        conversations.value[currentConvIndex].messages[modelMessageIndex].parts = [
          { text: accumulatedText + '\n(已停止)' }
        ]
      }
    } else if (accumulatedText === '') {
      // 正常结束但无内容（可能被安全过滤）
      conversations.value[currentConvIndex].messages[modelMessageIndex].parts = [
        { text: '(无有效响应)' }
      ]
      error.value = '模型没有返回有效内容，可能已被安全设置过滤。'
    } else {
      // 确保最终文本设置正确
      conversations.value[currentConvIndex].messages[modelMessageIndex].parts = [
        { text: accumulatedText }
      ]
    }
  } catch (err: any) {
    console.error('Gemini API 调用期间出错:', err)
    error.value = `API 错误: ${err.message || '发生未知错误。'}`
    // 出错时移除占位符
    conversations.value[currentConvIndex].messages.pop()
  } finally {
    isLoading.value = false
    streamingUpdate.value = false
    isStopping.value = false // 确保重置停止标志
    await scrollToBottom()
  }
}

// 停止流式响应
const stopStreaming = () => {
  console.log('请求停止流式响应...')
  isStopping.value = true
  // isLoading 和 streamingUpdate 会在 sendMessage 的 finally 块中被重置
}

// --- 生命周期和监听 ---
onMounted(() => {
  if (initializeGemini()) {
    loadConversations() // 加载历史记录，并会自动选择或新建对话
  }
  // 确保 textarea 高度在加载后正确设置
  nextTick(autoGrowTextarea)
})

// 监听对话列表变化并保存
watch(conversations, saveConversations, { deep: true })
</script>

<style lang="less" scoped>
// 引入之前的暗色主题变量和基础样式 (略作调整)

@import '@renderer/assets/variables.less';
// 整体应用容器
.chat-app-container {
  display: flex;
  height: 90vh; // 调整整体高度
  max-height: 800px; // 最大高度
  max-width: 1000px; // 调整整体宽度
  margin: 20px auto;
  background-color: @dark-bg;
  border-radius: 8px;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
  overflow: hidden; // 防止内容溢出容器圆角
}

// 侧边栏样式
.sidebar {
  width: @sidebar-width;
  background-color: @dark-bg-secondary;
  border-right: 1px solid @border-color;
  display: flex;
  flex-direction: column;
  flex-shrink: 0; // 防止侧边栏被压缩

  .new-chat-btn {
    margin: 15px;
    padding: 10px 15px;
    background-color: @accent-color;
    color: white;
    border: none;
    border-radius: @border-radius-small;
    cursor: pointer;
    text-align: center;
    font-size: 0.9em;
    transition: background-color 0.2s;

    &:hover {
      background-color: @accent-color-hover;
    }
  }

  .conversation-list {
    flex-grow: 1;
    overflow-y: auto;
    padding: 0 10px 10px 10px;

    // 滚动条样式 (可选)
    &::-webkit-scrollbar {
      width: 6px;
    }
    &::-webkit-scrollbar-track {
      background: transparent;
    }
    &::-webkit-scrollbar-thumb {
      background-color: @dark-bg-tertiary;
      border-radius: 3px;
    }
    &::-webkit-scrollbar-thumb:hover {
      background-color: lighten(@dark-bg-tertiary, 10%);
    }

    .conversation-item {
      padding: 10px 15px;
      margin-bottom: 5px;
      border-radius: @border-radius-small;
      cursor: pointer;
      color: @dark-text-secondary;
      font-size: 0.9em;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      transition:
        background-color 0.2s,
        color 0.2s;

      &:hover {
        background-color: @dark-bg-tertiary;
        color: @dark-text-primary;
      }

      &.active {
        background-color: @accent-color;
        color: white;
        font-weight: 500;
      }
    }
  }
}

// 主聊天容器样式 (继承部分并调整)
.chat-container {
  flex-grow: 1; // 占据剩余空间
  display: flex;
  flex-direction: column;
  background-color: @dark-bg; // 主背景
  border-radius: 0; // 移除独立圆角
  box-shadow: none; // 移除独立阴影
  border: none; // 移除独立边框
  height: 100%; // 占满父容器高度

  h2 {
    padding: 12px 20px; // 增加左右内边距
    border-top-left-radius: 0; // 移除顶部圆角
    border-top-right-radius: 0;
    text-align: left; // 标题左对齐
    font-size: 1em; // 调整标题大小
  }

  .message-area {
    // 继承之前的样式
    flex-grow: 1;
    overflow-y: auto;
    padding: 15px 20px; // 调整内边距
    display: flex;
    flex-direction: column;
    gap: 12px;

    // 滚动条样式 (可选)
    &::-webkit-scrollbar {
      width: 8px;
    }
    &::-webkit-scrollbar-track {
      background: @dark-bg;
      border-radius: 4px;
    }
    &::-webkit-scrollbar-thumb {
      background-color: @dark-bg-tertiary;
      border-radius: 4px;
      border: 2px solid @dark-bg;
    }
    &::-webkit-scrollbar-thumb:hover {
      background-color: lighten(@dark-bg-tertiary, 10%);
    }

    .message {
      // 继承之前的样式
      padding: 10px 15px;
      border-radius: @border-radius-base;
      max-width: 85%;
      word-wrap: break-word;
      line-height: 1.5;

      &.user-message {
        background-color: @user-bubble-bg;
        color: @user-bubble-text;
        align-self: flex-end;
        border-bottom-right-radius: @border-radius-small;
        .message-content strong {
          color: fade(@user-bubble-text, 80%);
        }
      }

      &.model-message {
        background-color: @model-bubble-bg;
        color: @model-bubble-text;
        align-self: flex-start;
        border-bottom-left-radius: @border-radius-small;
        .message-content strong {
          color: @dark-text-secondary;
        }
        // 加载中的特定样式
        &:has(.loading-dots) {
          color: @dark-text-secondary;
        }
      }

      .message-content {
        strong {
          display: block;
          margin-bottom: 4px;
          font-size: 0.85em;
          font-weight: 600;
        }
        // 用户消息的 <pre> 样式
        pre.message-text {
          white-space: pre-wrap;
          margin: 0;
          font-family: inherit;
          font-size: 1em;
          color: inherit;
        }
        // 模型消息的 Markdown 渲染容器样式
        .markdown-body {
          font-size: 1em;
          color: inherit;
          // 添加基本的 Markdown 元素样式
          p {
            margin: 0 0 0.5em 0;
          }
          ul,
          ol {
            margin: 0.5em 0;
            padding-left: 2em;
          }
          li {
            margin-bottom: 0.2em;
          }
          code {
            background-color: darken(@dark-bg-tertiary, 5%);
            padding: 0.2em 0.4em;
            border-radius: 3px;
            font-family: Consolas, Monaco, 'Andale Mono', 'Ubuntu Mono', monospace;
            font-size: 0.9em;
            color: @dark-text-primary;
          }
          pre {
            background-color: darken(@dark-bg-tertiary, 7%);
            padding: 1em;
            border-radius: @border-radius-small;
            overflow-x: auto; // 代码块横向滚动
            margin: 0.5em 0;
            code {
              // pre 内的 code 不再需要额外背景和 padding
              background-color: transparent;
              padding: 0;
            }
          }
          blockquote {
            border-left: 4px solid @accent-color;
            margin: 0.5em 0;
            padding-left: 1em;
            color: @dark-text-secondary;
          }
          a {
            color: lighten(@accent-color, 15%);
            text-decoration: none;
            &:hover {
              text-decoration: underline;
            }
          }
          strong {
            font-weight: 600;
          }
          em {
            font-style: italic;
          }
          hr {
            border: 0;
            border-top: 1px solid @border-color;
            margin: 1em 0;
          }
        }
      }
    }
  }

  .error-message {
    /* 继承 */
    padding: 10px;
    color: @error-text;
    text-align: center;
    background-color: @error-bg;
    border: 1px solid darken(@error-bg, 10%);
    margin: 0 20px 10px 20px;
    border-radius: 4px;
  }
  .loading-dots {
    /* 继承 */
    display: inline-block;
    position: relative;
    left: -4px;
    color: @dark-text-secondary;
    &::after {
      content: ' .';
      animation: dots 1.4s steps(5, end) infinite;
      position: absolute;
      color: inherit;
    }
  }
  @keyframes dots {
    /* 继承 */
    0%,
    20% {
      color: rgba(0, 0, 0, 0);
      text-shadow:
        0.25em 0 0 rgba(0, 0, 0, 0),
        0.5em 0 0 rgba(0, 0, 0, 0);
    }
    40% {
      color: inherit;
      text-shadow:
        0.25em 0 0 rgba(0, 0, 0, 0),
        0.5em 0 0 rgba(0, 0, 0, 0);
    }
    60% {
      text-shadow:
        0.25em 0 0 inherit,
        0.5em 0 0 rgba(0, 0, 0, 0);
    }
    80%,
    100% {
      text-shadow:
        0.25em 0 0 inherit,
        0.5em 0 0 inherit;
    }
  }

  // 输入区域包装器，包含停止按钮
  .input-wrapper {
    position: relative; // 用于定位停止按钮
    padding: 12px 12px 12px 12px; // 调整内边距
    border-top: 1px solid @border-color;
    background-color: @dark-bg-secondary;

    .stop-btn {
      position: absolute;
      top: -40px; // 定位到输入框上方中间
      left: 50%;
      transform: translateX(-50%);
      background-color: darken(@error-bg, 5%);
      color: @error-text;
      border: 1px solid darken(@error-bg, 15%);
      border-radius: @border-radius-small;
      padding: 4px 12px;
      cursor: pointer;
      font-size: 1.2em; // 增大停止符号
      line-height: 1;
      z-index: 10;
      transition: background-color 0.2s;

      &:hover {
        background-color: darken(@error-bg, 15%);
      }
    }

    .input-area {
      display: flex;
      align-items: flex-end; // 保持按钮和文本域底部对齐

      textarea {
        // 继承之前的样式
        flex-grow: 1;
        padding: 10px 12px;
        border: 1px solid @border-color;
        border-radius: @border-radius-base;
        resize: none;
        margin-right: 10px;
        font-family: inherit;
        font-size: 1em;
        line-height: 1.4;
        min-height: 40px;
        max-height: 150px;
        overflow-y: auto;
        box-sizing: border-box;
        background-color: @dark-bg-tertiary;
        color: @dark-text-primary;
        &::placeholder {
          color: @dark-text-secondary;
          opacity: 0.7;
        }
        &:focus {
          outline: none;
          border-color: @accent-color;
          box-shadow: 0 0 0 2px fade(@accent-color, 25%);
        }
      }

      button {
        // 继承之前的样式
        padding: 0; // 移除内边距，让 SVG 控制大小
        width: 40px; // 固定宽度
        height: 40px; // 固定高度
        border: none;
        background-color: @accent-color;
        color: white;
        border-radius: 50%; /* 改为圆形按钮 */
        cursor: pointer;
        transition: background-color 0.2s;
        font-size: 1em;
        flex-shrink: 0;
        display: flex;
        justify-content: center;
        align-items: center;
        &:disabled {
          background-color: @disabled-color;
          color: darken(@dark-text-secondary, 10%);
          cursor: not-allowed;
        }
        &:not(:disabled):hover {
          background-color: @accent-color-hover;
        }
      }
    }
  }

  .api-key-warning {
    /* 继承 */
    text-align: center;
    padding: 8px;
    background-color: @warning-bg;
    color: @warning-text;
    font-size: 0.85em;
    border-top: 1px solid @border-color;
    border-bottom-left-radius: 8px;
    border-bottom-right-radius: 8px;
  }
}
</style>
