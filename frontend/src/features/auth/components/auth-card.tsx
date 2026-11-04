import { PageHeading } from "@/components/layout/page-heading";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function AuthCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="border-t-4 border-t-brand shadow-sm">
      <CardHeader>
        <CardTitle>
          <PageHeading className="sm:text-2xl">{title}</PageHeading>
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
