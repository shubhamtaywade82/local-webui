import { KnowledgeEngine } from "@workspace/knowledge-engine";
import { resolveKnowledgeRoot } from "../config/knowledgeRoot";
import path from "path";

// Support both the static knowledge base and the active workspace code
const workspaceRoot = path.join(process.cwd(), "../../workspace");

export const knowledgeEngine = new KnowledgeEngine([
  resolveKnowledgeRoot(),
  workspaceRoot,
  '/home/nemesis/project/trading-workspace/indicator_hub'
]);
