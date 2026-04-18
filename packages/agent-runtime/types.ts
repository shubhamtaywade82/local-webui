export interface AgentConfig {
  model: string;
  maxIterations: number;
  mode: 'auto' | 'step';
}

export interface LoopEvent {
  type: 'agent_step' | 'agent_step_pending' | 'token' | 'tool_call' | 'done' | 'error';
  payload: Record<string, unknown>;
}

export type EventEmitter = (event: LoopEvent) => void;

export type StepApprovalFn = (stepId: string, toolName: string, toolInput: Record<string, unknown>) => Promise<boolean>;
