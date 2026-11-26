// Staff chat is an add-on service: the Operator generates it into an app only when it is switched on.
// Everything that touches chat from the rest of the app goes through this file, so that when chat is left out
// the Operator replaces just this file with a stub and none of the chat code, API or doctypes are included.
export { default as ChatMenu } from '../components/chat/ChatMenu.jsx'
export { default as ChatShareForm } from '../components/chat/ChatShare.jsx'
export { shareInChat } from '../components/chat/shareInChat.js'
export const CHAT_ENABLED = true
