export { createCompletion, createCompletionService } from './completionService.js'
export { embedText } from './embeddingService.js'
export {
  aiProvider,
  awsRegion,
  conversationModel,
  embeddingModel,
  fastModel,
  judgeModel,
  modelFor,
  policyFor,
  speechToTextModel,
} from './modelRouter.js'
export { isSpeechToTextEnabled, transcribeAudio } from './speechToTextService.js'
export { isTextToSpeechEnabled, synthesizeSpeech } from './textToSpeechService.js'