import Anthropic from "@anthropic-ai/sdk";

export interface MemoryContext {
  role: string;
  customer?: string;
  facility?: string;
  doorId?: string;
  userMessage?: string;
  promptBlock?: string;
}

export async function beforeLoop(ctx: {
  role: string;
  customer?: string;
  facility?: string;
  doorId?: string;
  userMessage?: string;
}): Promise<MemoryContext | null> {
  return null;
}

export async function afterLoop(
  memCtx: MemoryContext,
  result: {
    responseText: string;
    toolsCalled: string[];
    anthropic: Anthropic;
  }
): Promise<void> {
  return;
}
