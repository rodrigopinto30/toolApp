import { Alert, AlertDescription } from "@/components/ui/alert";

export function FormAlert({ message, tone = "error" }: { message?: string; tone?: "error" | "success" }) {
  if (!message) {
    return null;
  }
  return (
    <Alert variant={tone === "error" ? "destructive" : "default"} role={tone === "error" ? "alert" : "status"}>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
