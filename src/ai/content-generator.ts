/**
 * AI Content Generation System
 * Leverages Cloudflare Workers AI for image, audio, video, and text generation
 */

export interface GenerationRequest {
  type: 'image' | 'audio' | 'video' | 'text';
  prompt: string;
  parameters?: Record<string, any>;
}

export interface GenerationResult {
  success: boolean;
  data?: ArrayBuffer | string;
  mimeType?: string;
  url?: string;
  metadata?: Record<string, any>;
  error?: string;
}

export interface AIModel {
  id: string;
  name: string;
  type: string;
  category: string;
  costPer1K?: number;
}

const logger = {
  info: (tag: string, message: string, data?: any) => {
    console.log(`[${new Date().toISOString()}] [INFO] [${tag}] ${message}`, data || '');
  },
  error: (tag: string, message: string, error?: any) => {
    console.error(`[${new Date().toISOString()}] [ERROR] [${tag}] ${message}`, error || '');
  },
  warn: (tag: string, message: string, data?: any) => {
    console.warn(`[${new Date().toISOString()}] [WARN] [${tag}] ${message}`, data || '');
  },
  debug: (tag: string, message: string, data?: any) => {
    console.log(`[${new Date().toISOString()}] [DEBUG] [${tag}] ${message}`, data || '');
  },
};

/**
 * Available AI Models on Cloudflare Workers AI
 */
const AVAILABLE_MODELS: Record<string, AIModel[]> = {
  image: [
    {
      id: '@cf/stabilityai/stable-diffusion-xl-generate',
      name: 'Stable Diffusion XL',
      type: 'image_generation',
      category: 'Image Generation',
    },
  ],
  text: [
    {
      id: '@cf/meta/llama-2-7b-chat-int8',
      name: 'Llama 2 7B',
      type: 'text_generation',
      category: 'Text Generation',
    },
    {
      id: '@cf/mistral/mistral-7b-instruct-v0.2',
      name: 'Mistral 7B',
      type: 'text_generation',
      category: 'Text Generation',
    },
  ],
  audio: [
    {
      id: '@cf/openai/whisper',
      name: 'Whisper',
      type: 'audio_transcription',
      category: 'Audio Transcription',
    },
  ],
  video: [
    {
      id: '@cf/stabilityai/stable-video',
      name: 'Stable Video Diffusion',
      type: 'video_generation',
      category: 'Video Generation',
    },
  ],
};

/**
 * AIContentGenerator - Generate content using Cloudflare Workers AI
 */
export class AIContentGenerator {
  private ai: any; // Cloudflare Workers AI binding
  private costLog: Array<{ timestamp: Date; type: string; costEstimate: number }> = [];

  constructor(aiBinding: any) {
    this.ai = aiBinding;
    logger.info('AI_GEN', 'AI Content Generator initialized');
  }

  /**
   * Generate image from text prompt
   */
  async generateImage(prompt: string, parameters?: { guidance?: number; seed?: number; steps?: number }): Promise<GenerationResult> {
    try {
      logger.info('AI_GEN', `Generating image: ${prompt.substring(0, 50)}...`);

      const response = await this.ai.run('@cf/stabilityai/stable-diffusion-xl-generate', {
        prompt,
        guidance: parameters?.guidance || 7.5,
        seed: parameters?.seed || Math.floor(Math.random() * 1000000),
        steps: parameters?.steps || 30,
      });

      if (!response || !response.image) {
        logger.error('AI_GEN', 'No image data in response');
        return { success: false, error: 'No image generated' };
      }

      logger.info('AI_GEN', 'Image generated successfully');
      this.logCost('image', 0.0015); // Estimated cost per image

      return {
        success: true,
        data: response.image,
        mimeType: 'image/png',
        metadata: {
          model: 'Stable Diffusion XL',
          prompt,
          guidance: parameters?.guidance || 7.5,
          steps: parameters?.steps || 30,
        },
      };
    } catch (error) {
      logger.error('AI_GEN', 'Image generation error', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Image generation failed',
      };
    }
  }

  /**
   * Transcribe audio to text
   */
  async transcribeAudio(audioData: ArrayBuffer): Promise<GenerationResult> {
    try {
      logger.info('AI_GEN', 'Transcribing audio', { size: audioData.byteLength });

      // Convert ArrayBuffer to Blob for Whisper API
      const blob = new Blob([audioData], { type: 'audio/wav' });

      const response = await this.ai.run('@cf/openai/whisper', {
        audio: blob,
      });

      if (!response || !response.text) {
        logger.error('AI_GEN', 'No transcription in response');
        return { success: false, error: 'Transcription failed' };
      }

      logger.info('AI_GEN', 'Audio transcribed successfully', { textLength: response.text.length });
      this.logCost('audio', 0.0001); // Estimated cost per transcription

      return {
        success: true,
        data: response.text,
        mimeType: 'text/plain',
        metadata: {
          model: 'Whisper',
          audioSize: audioData.byteLength,
        },
      };
    } catch (error) {
      logger.error('AI_GEN', 'Audio transcription error', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Transcription failed',
      };
    }
  }

  /**
   * Generate text using LLM
   */
  async generateText(prompt: string, parameters?: { model?: string; temperature?: number; maxTokens?: number }): Promise<GenerationResult> {
    try {
      logger.info('AI_GEN', `Generating text: ${prompt.substring(0, 50)}...`);

      const modelId = parameters?.model || '@cf/meta/llama-2-7b-chat-int8';

      const response = await this.ai.run(modelId, {
        messages: [{ role: 'user', content: prompt }],
        temperature: parameters?.temperature || 0.7,
        max_tokens: parameters?.maxTokens || 1024,
      });

      if (!response || !response.response) {
        logger.error('AI_GEN', 'No text in response');
        return { success: false, error: 'Text generation failed' };
      }

      logger.info('AI_GEN', 'Text generated successfully', { length: response.response.length });
      this.logCost('text', 0.0005); // Estimated cost per request

      return {
        success: true,
        data: response.response,
        mimeType: 'text/plain',
        metadata: {
          model: modelId,
          tokensUsed: Math.ceil(response.response.length / 4), // Rough estimation
          temperature: parameters?.temperature || 0.7,
        },
      };
    } catch (error) {
      logger.error('AI_GEN', 'Text generation error', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Text generation failed',
      };
    }
  }

  /**
   * Generate video from image or prompt (simulated)
   */
  async generateVideo(promptOrImage: string | ArrayBuffer, parameters?: { duration?: number; fps?: number }): Promise<GenerationResult> {
    try {
      logger.info('AI_GEN', 'Generating video');

      // Note: Stable Video Diffusion requires initial frame as input
      // This is a placeholder for the actual implementation

      const response = await this.ai.run('@cf/stabilityai/stable-video', {
        image: promptOrImage instanceof ArrayBuffer ? new Blob([promptOrImage]) : promptOrImage,
        motion_bucket_id: 127,
        seed: Math.floor(Math.random() * 1000000),
      });

      if (!response) {
        logger.error('AI_GEN', 'No video data in response');
        return { success: false, error: 'Video generation failed' };
      }

      logger.info('AI_GEN', 'Video generated successfully');
      this.logCost('video', 0.005); // Estimated cost per video

      return {
        success: true,
        data: response,
        mimeType: 'video/mp4',
        metadata: {
          model: 'Stable Video Diffusion',
          duration: parameters?.duration || 4,
          fps: parameters?.fps || 8,
        },
      };
    } catch (error) {
      logger.error('AI_GEN', 'Video generation error', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Video generation failed',
      };
    }
  }

  /**
   * Process and enhance image (using text generation for analysis)
   */
  async analyzeImage(imageUrl: string, question: string = 'What do you see in this image?'): Promise<GenerationResult> {
    try {
      logger.info('AI_GEN', 'Analyzing image', { url: imageUrl });

      // Use LLM to analyze image description
      const prompt = `You are analyzing an image. Image URL: ${imageUrl}\n\nQuestion: ${question}\n\nProvide a detailed analysis.`;

      return this.generateText(prompt, { maxTokens: 500 });
    } catch (error) {
      logger.error('AI_GEN', 'Image analysis error', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Image analysis failed',
      };
    }
  }

  /**
   * Generate speech from text (text-to-speech simulation)
   */
  async generateSpeech(text: string, parameters?: { voice?: string; speed?: number }): Promise<GenerationResult> {
    try {
      logger.info('AI_GEN', 'Generating speech', { textLength: text.length });

      // Note: Cloudflare Workers AI doesn't have direct TTS yet
      // This is a placeholder for future TTS model integration

      logger.warn('AI_GEN', 'TTS not yet available on Cloudflare Workers AI');

      return {
        success: false,
        error: 'Text-to-speech not yet available. Please use a dedicated TTS service.',
      };
    } catch (error) {
      logger.error('AI_GEN', 'Speech generation error', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Speech generation failed',
      };
    }
  }

  /**
   * Create visual summary/report from data
   */
  async createDataVisualization(data: Record<string, any>, visualType: 'chart' | 'infographic' | 'summary'): Promise<GenerationResult> {
    try {
      logger.info('AI_GEN', `Creating ${visualType}`, { dataSize: JSON.stringify(data).length });

      const prompt = `Create a ${visualType} description for this data: ${JSON.stringify(data)}. 
        Provide ASCII art representation or detailed text description suitable for display.`;

      return this.generateText(prompt, { maxTokens: 2048 });
    } catch (error) {
      logger.error('AI_GEN', `${visualType} creation error`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : `${visualType} creation failed`,
      };
    }
  }

  /**
   * Log cost for usage tracking
   */
  private logCost(type: string, costEstimate: number) {
    this.costLog.push({
      timestamp: new Date(),
      type,
      costEstimate,
    });
  }

  /**
   * Get cost summary
   */
  getCostSummary(): { totalCost: number; breakdown: Record<string, number>; count: number } {
    const breakdown: Record<string, number> = {};
    let totalCost = 0;

    this.costLog.forEach((log) => {
      if (!breakdown[log.type]) {
        breakdown[log.type] = 0;
      }
      breakdown[log.type] += log.costEstimate;
      totalCost += log.costEstimate;
    });

    return {
      totalCost,
      breakdown,
      count: this.costLog.length,
    };
  }

  /**
   * Get available models
   */
  getAvailableModels(type?: string): AIModel[] {
    if (type) {
      return AVAILABLE_MODELS[type] || [];
    }

    return Object.values(AVAILABLE_MODELS).flat();
  }

  /**
   * Format models for display
   */
  formatModelsDisplay(): string {
    let display = '🤖 **Available AI Models**\n\n';

    Object.entries(AVAILABLE_MODELS).forEach(([type, models]) => {
      display += `**${type.toUpperCase()}**\n`;
      models.forEach((model) => {
        display += `• ${model.name} (${model.id})\n`;
      });
      display += '\n';
    });

    display += '**Examples:**\n';
    display += '• "Generate a sunset landscape image"\n';
    display += '• "Transcribe my voice memo"\n';
    display += '• "Write a product description for coffee"\n';
    display += '• "Create a promotional video from this image"\n';

    return display;
  }

  /**
   * Clear cost log
   */
  clearCostLog() {
    this.costLog = [];
  }
}
