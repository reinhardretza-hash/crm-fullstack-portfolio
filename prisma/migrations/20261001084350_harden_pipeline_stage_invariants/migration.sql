-- Eine Stufe darf nie gleichzeitig Gewonnen- und Verloren-Stufe sein.
ALTER TABLE "pipeline_stages"
  ADD CONSTRAINT "pipeline_stages_not_won_and_lost_check"
  CHECK (NOT (is_won_stage = true AND is_lost_stage = true));

-- Höchstens eine Won-Stufe pro Pipeline (unterschiedliche Pipelines dürfen
-- jeweils eigene haben, da pipeline_id Teil des indexierten Schlüssels ist).
CREATE UNIQUE INDEX "pipeline_stages_single_won_per_pipeline_idx"
  ON "pipeline_stages" ("pipeline_id")
  WHERE "is_won_stage" = true;

-- Höchstens eine Lost-Stufe pro Pipeline, analog zur Won-Stufe.
CREATE UNIQUE INDEX "pipeline_stages_single_lost_per_pipeline_idx"
  ON "pipeline_stages" ("pipeline_id")
  WHERE "is_lost_stage" = true;
