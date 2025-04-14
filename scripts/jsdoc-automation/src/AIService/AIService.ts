import { ChatOpenAI } from '@langchain/openai';
import dotenv from 'dotenv';
import type { Configuration } from '../Configuration.js';
import { CodeFormatter } from './utils/CodeFormatter.js';

dotenv.config();

/**
 * Service for interacting with OpenAI chat API.
 */
export class AIService {
  private readonly chatModel: ChatOpenAI;
  private readonly codeFormatter: CodeFormatter;
  private readonly chatModelFAQ: ChatOpenAI;
  private readonly configuration: Configuration;

  /**
   * Constructor for initializing the ChatOpenAI instance.
   *
   * @param configuration - The configuration instance to be used
   * @throws {Error} If OPENAI_API_KEY environment variable is not set
   */
  constructor(configuration: Configuration) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not set');
    }
    this.configuration = configuration;
    this.chatModel = new ChatOpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.chatModelFAQ = new ChatOpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      model: 'gpt-4o',
    });
    this.codeFormatter = new CodeFormatter();
  }

  /**
   * Generates a comment by invoking the chat model with the specified prompt.
   * @param prompt - The prompt for which to generate a comment
   * @param isFAQ - Whether to use the FAQ model
   * @returns The generated comment
   */
  public async generateComment(prompt: string, isFAQ = false): Promise<string> {
    try {
      const finalPrompt = isFAQ
        ? prompt
        : this.codeFormatter.truncateCodeBlock(prompt, 8000);
      console.log(
        `Generating comment for prompt of length: ${finalPrompt.length}`,
      );
      return await this.tryGenerateComment(finalPrompt, prompt, isFAQ);
    } catch (error) {
      this.handleAPIError(error as Error);
      return '';
    }
  }

  /**
   * Attempts to generate a comment with retry logic for token limits.
   * @param prompt - The initial prompt
   * @param originalPrompt - The original prompt for retries
   * @param isFAQ - Whether to use the FAQ model
   * @returns The generated comment
   */
  private async tryGenerateComment(
    prompt: string,
    originalPrompt: string,
    isFAQ: boolean,
  ): Promise<string> {
    const model = isFAQ ? this.chatModelFAQ : this.chatModel;
    try {
      const response = await model.invoke(prompt);
      return response.content as string;
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes('maximum context length')
      ) {
        return await this.retryWithTruncation(error, originalPrompt, model);
      }
      throw error;
    }
  }

  /**
   * Retries comment generation with progressively truncated prompts.
   * @param error - The initial error
   * @param prompt - The original prompt
   * @param model - The chat model to use
   * @returns The generated comment
   */
  private async retryWithTruncation(
    error: Error,
    prompt: string,
    model: ChatOpenAI,
  ): Promise<string> {
    const limits = [4000, 2000];
    for (const limit of limits) {
      try {
        console.warn(`Token limit exceeded, retrying with ${limit} chars...`);
        const truncatedPrompt = this.codeFormatter.truncateCodeBlock(
          prompt,
          limit,
        );
        const response = await model.invoke(truncatedPrompt);
        return response.content as string;
      } catch (retryError) {
        if (
          retryError instanceof Error &&
          !retryError.message.includes('maximum context length')
        ) {
          throw retryError;
        }
      }
    }
    throw error; // Rethrow original error if all retries fail
  }

  /**
   * Handles API errors by logging and rethrowing.
   * @param error - The error object to handle
   */
  public handleAPIError(error: Error): void {
    console.error('API Error:', error.message);
    throw error;
  }
}
