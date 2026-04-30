import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { User, Bell, Shield, Paintbrush } from "lucide-react";
import { useState } from "react";

export default function Settings() {
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = () => {
    setIsSaving(true);
    setTimeout(() => {
      setIsSaving(false);
      toast({ title: "Settings saved successfully" });
    }, 800);
  };

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Settings</h1>
        <p className="text-muted-foreground mt-1 text-lg">Manage your account preferences and app settings.</p>
      </div>

      <div className="grid gap-8">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <User className="h-5 w-5 text-primary" /> Profile Information
            </CardTitle>
            <CardDescription>Update your personal details used for signatures.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name</Label>
                <Input id="firstName" defaultValue="User" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name</Label>
                <Input id="lastName" defaultValue="Name" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input id="email" type="email" defaultValue="user@example.com" disabled />
              <p className="text-xs text-muted-foreground">To change your email, please contact support.</p>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Bell className="h-5 w-5 text-primary" /> Notifications
            </CardTitle>
            <CardDescription>Choose what updates you want to receive.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-base">Document Signed</Label>
                <p className="text-sm text-muted-foreground">Receive an email when someone signs your document.</p>
              </div>
              <Switch defaultChecked />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-base">Signature Requests</Label>
                <p className="text-sm text-muted-foreground">Receive an email when someone requests your signature.</p>
              </div>
              <Switch defaultChecked />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-base">Marketing Updates</Label>
                <p className="text-sm text-muted-foreground">Receive emails about new features and tips.</p>
              </div>
              <Switch />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" /> Security
            </CardTitle>
            <CardDescription>Manage your security preferences.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div className="space-y-0.5">
                <p className="font-medium">Password</p>
                <p className="text-sm text-muted-foreground">Last changed 3 months ago</p>
              </div>
              <Button variant="outline">Change Password</Button>
            </div>
            <div className="flex items-center justify-between pt-2">
              <div className="space-y-0.5">
                <p className="font-medium">Two-Factor Authentication</p>
                <p className="text-sm text-muted-foreground">Add an extra layer of security to your account.</p>
              </div>
              <Button variant="outline">Enable 2FA</Button>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button size="lg" onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save All Changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}
