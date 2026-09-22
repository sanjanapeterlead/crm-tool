import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface PipelineStageRow {
  id: string;
  pipeline_id: string;
  key: string;
  label: string;
  sort_order: number;
  is_default: boolean;
  is_won: boolean;
  is_lost: boolean;
}

export interface PipelineWithStages {
  id: string;
  name: string;
  stages: PipelineStageRow[];
}

/**
 * The org's default pipeline and its ordered stages. V1 has exactly one
 * pipeline per org; callers that need "where does a new lead start" use
 * `entryStage()` rather than assuming a stage name.
 */
export async function getDefaultPipeline(db: SupabaseClient, orgId: string): Promise<PipelineWithStages> {
  const { data: pipeline, error } = await db
    .from("pipelines")
    .select("id, name")
    .eq("org_id", orgId)
    .eq("is_default", true)
    .maybeSingle();

  if (error) throw new Error(`Failed to load pipeline: ${error.message}`);
  if (!pipeline) throw new Error("This organization has no default pipeline.");

  const { data: stages, error: stagesError } = await db
    .from("lead_statuses")
    .select("id, pipeline_id, key, label, sort_order, is_default, is_won, is_lost")
    .eq("org_id", orgId)
    .eq("pipeline_id", pipeline.id)
    .order("sort_order");

  if (stagesError) throw new Error(`Failed to load pipeline stages: ${stagesError.message}`);

  return { id: pipeline.id as string, name: pipeline.name as string, stages: (stages ?? []) as PipelineStageRow[] };
}

/** The stage a brand-new opportunity enters: the one flagged default, else the first. */
export function entryStage(pipeline: PipelineWithStages): PipelineStageRow {
  const stage = pipeline.stages.find((s) => s.is_default) ?? pipeline.stages[0];
  if (!stage) throw new Error("The default pipeline has no stages.");
  return stage;
}
