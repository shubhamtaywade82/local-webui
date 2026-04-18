import { KnowledgeEngine } from "@workspace/knowledge-engine";
import { resolveKnowledgeRoot } from "../config/knowledgeRoot";

export const knowledgeEngine = new KnowledgeEngine(resolveKnowledgeRoot());
