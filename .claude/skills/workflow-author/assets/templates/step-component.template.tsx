 "use client";

/**
 * {{STEP_TITLE}} Component
 *
 * Step component for {{workflow_slug}} workflow.
 * Renders UI for {{STEP_ID}} step.
 *
 * ## Component Pattern
 *
 * This is a **dumb component** that receives props from the workflow client
 * (`<slug>-client.tsx`) which is typically implemented with `WorkflowContainer`.
 * It does not manage orchestration state or call APIs directly.
 *
 * - **Input**: Current step input data (from `WorkflowContainer`'s `getStepInput()`)
 * - **Output**: Previous step output (null if not yet run)
 * - **onChange**: Callback to update step input in workflow state
 * - **onRun**: Callback to trigger step execution (client calls analyze route)
 *
 * ## UI Components
 *
 * Use shadcn/ui components for consistent styling:
 * - `Card`, `CardContent`, `CardHeader`, `CardTitle` for layout
 * - `Button`, `Input`, `Textarea`, `Label` for form elements
 * - `Loader2` from lucide-react for loading states
 * - `WorkflowReportCard` (from `@/components/workflows/workflow-report-card`) for final report steps
 */

import { useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import type {
  StepInput,
  StepOutput,
} from "@/lib/workflows/{{workflow_slug}}/spec";

interface {{STEP_TITLE_PASCAL}}Props {
  /** Step input data */
  input: StepInput<"{{STEP_ID}}">;

  /** Step output data (null if not yet run) */
  output: StepOutput<"{{STEP_ID}}"> | null;

  /** Called when input changes */
  onChange: (input: StepInput<"{{STEP_ID}}">) => void;

  /** Called when user wants to run this step */
  onRun: () => void;

  /** Whether step is currently running */
  isRunning?: boolean;

  /** Whether step is read-only (already completed) */
  readOnly?: boolean;
}

export function {{STEP_TITLE_PASCAL}}({
  input,
  output,
  onChange,
  onRun,
  isRunning = false,
  readOnly = false,
}: {{STEP_TITLE_PASCAL}}Props) {
  const handleInputChange = useCallback(
    (field: keyof StepInput<"{{STEP_ID}}">, value: any) => {
      onChange({ ...input, [field]: value });
    },
    [input, onChange]
  );

  return (
    <div className="space-y-6">
      {/* Input Section */}
      <Card>
        <CardHeader>
          <CardTitle>Input</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Example input field - customize based on inputSchema */}
          <div>
            <Label htmlFor="exampleField">Example Field</Label>
            <Input
              id="exampleField"
              value={input.exampleField || ""}
              onChange={(e) =>
                handleInputChange("exampleField", e.target.value)
              }
              disabled={readOnly || isRunning}
              placeholder="Enter example value..."
            />
          </div>

          {/* Add more input fields based on your inputSchema */}

          <Button
            onClick={onRun}
            disabled={isRunning || readOnly}
            className="w-full"
          >
            {isRunning ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Analyzing...
              </>
            ) : (
              "Run Analysis"
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Output Section */}
      {output && (
        <Card>
          <CardHeader>
            <CardTitle>Results</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* 
              Example output display - customize based on outputSchema 
              
              TIP: For report/final steps, use WorkflowReportCard instead of a basic Card:
              
              import { WorkflowReportCard } from "@/components/workflows/workflow-report-card";
              
              <WorkflowReportCard
                title="Final Report"
                content={output.result}
                onContentChange={(newContent) => handleInputChange("result", newContent)}
                downloadProps={{
                  filename: "report",
                  content: output.result,
                  // ... options
                }}
              />
            */}
            <div>
              <Label>Result</Label>
              <Textarea
                value={output.result || ""}
                readOnly
                rows={5}
                className="font-mono"
                style={{ fontSize: "var(--chat-small-text)" }}
              />
            </div>

            {output.confidence !== undefined && (
              <div>
                <Label>Confidence</Label>
                <div className="text-lg font-semibold">
                  {(output.confidence * 100).toFixed(1)}%
                </div>
              </div>
            )}

            {/* Add more output displays based on your outputSchema */}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
