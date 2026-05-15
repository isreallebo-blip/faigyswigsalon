import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useHebrewSettings } from "@/lib/use-hebrew-settings";

export const Route = createFileRoute("/_authenticated/settings/calendar")({
  component: CalendarSettings,
});

function CalendarSettings() {
  const { showDates, showHolidays, setShowDates, setShowHolidays } = useHebrewSettings();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-xl">Calendar</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label className="text-sm">Show Hebrew dates</Label>
            <p className="text-xs text-muted-foreground">Display the Hebrew date alongside the Gregorian date on the calendar.</p>
          </div>
          <Switch checked={showDates} onCheckedChange={setShowDates} />
        </div>
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label className="text-sm">Show Jewish holidays</Label>
            <p className="text-xs text-muted-foreground">Highlight major Jewish holidays on the calendar.</p>
          </div>
          <Switch checked={showHolidays} onCheckedChange={setShowHolidays} />
        </div>
      </CardContent>
    </Card>
  );
}
