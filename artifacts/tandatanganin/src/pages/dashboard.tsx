import { useGetDashboardSummary, useGetRecentActivity } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, Clock, CheckCircle, XCircle, Activity, ChevronRight, UserCheck } from "lucide-react";
import { Link, useLocation } from "wouter";
import { formatDate } from "@/lib/format";
import { useAuth } from "@/contexts/auth-context";

export default function Dashboard() {
  const { data: summary, isLoading: isLoadingSummary } = useGetDashboardSummary();
  const { data: activities, isLoading: isLoadingActivity } = useGetRecentActivity();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const isAdminOrAbove = user?.role === "admin" || user?.role === "superadmin";

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Dashboard</h1>
          <p className="text-muted-foreground mt-1 text-lg">Here's what's happening with your documents today.</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Documents"
          value={summary?.totalDocuments}
          icon={FileText}
          isLoading={isLoadingSummary}
        />
        {isAdminOrAbove && (
          <StatCard
            title="Pending Signatures"
            value={summary?.pendingDocuments}
            icon={Clock}
            isLoading={isLoadingSummary}
            alert={summary?.pendingDocuments ? summary.pendingDocuments > 0 : false}
          />
        )}
        <StatCard
          title="Signed Documents"
          value={summary?.signedDocuments}
          icon={CheckCircle}
          isLoading={isLoadingSummary}
        />
        <StatCard
          title="Rejected"
          value={summary?.rejectedDocuments}
          icon={XCircle}
          isLoading={isLoadingSummary}
        />
        <StatCard
          title="Pending Approvals"
          value={(summary as any)?.pendingApprovals}
          icon={UserCheck}
          isLoading={isLoadingSummary}
          alert={!!(summary as any)?.pendingApprovals && (summary as any).pendingApprovals > 0}
          onClick={isAdminOrAbove ? () => setLocation("/users?tab=pending") : undefined}
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4 shadow-sm">
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>
              Latest actions across all your documents.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingActivity ? (
              <div className="space-y-4">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : activities && activities.length > 0 ? (
              <div className="space-y-6">
                {activities.map((activity) => (
                  <div key={activity.id} className="flex items-center">
                    <div className="mr-4 mt-0.5 self-start">
                      <ActivityIcon action={activity.action} />
                    </div>
                    <div className="flex-1 space-y-1">
                      <p className="text-sm font-medium leading-none">
                        {activity.signerName} <span className="font-normal text-muted-foreground">{activity.action}</span> <Link href={`/documents/${activity.documentId}`} className="font-semibold text-primary hover:underline">{activity.documentTitle}</Link>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(activity.timestamp)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Activity className="h-12 w-12 mx-auto mb-4 opacity-20" />
                <p>No recent activity found.</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="col-span-3 shadow-sm flex flex-col">
          <CardHeader>
            <CardTitle>Signature Profiles</CardTitle>
            <CardDescription>
              Your saved signing identities.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-border pb-4">
                <span className="text-sm text-muted-foreground">Total Signatures</span>
                <span className="font-medium">{isLoadingSummary ? <Skeleton className="h-5 w-8" /> : summary?.totalSignatures || 0}</span>
              </div>
              <div className="flex items-center justify-between border-b border-border pb-4">
                <span className="text-sm text-muted-foreground">Added This Month</span>
                <span className="font-medium">{isLoadingSummary ? <Skeleton className="h-5 w-8" /> : summary?.signaturesThisMonth || 0}</span>
              </div>
            </div>
            
            <Link href="/signatures" className="mt-8 flex items-center justify-center w-full py-3 px-4 border border-input rounded-md shadow-sm text-sm font-medium hover:bg-secondary transition-colors group">
              Manage Signatures
              <ChevronRight className="ml-2 h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ 
  title, 
  value, 
  icon: Icon, 
  isLoading,
  alert,
  onClick,
}: { 
  title: string; 
  value?: number; 
  icon: React.ElementType; 
  isLoading: boolean;
  alert?: boolean;
  onClick?: () => void;
}) {
  return (
    <Card
      className={`shadow-sm transition-shadow ${onClick ? "cursor-pointer hover:shadow-md hover:ring-2 hover:ring-primary/20" : "hover:shadow-md"}`}
      onClick={onClick}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <Icon className={`h-4 w-4 ${alert ? 'text-amber-500' : 'text-muted-foreground'}`} />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-8 w-16 mt-1" />
        ) : (
          <div className={`text-3xl font-bold ${alert ? 'text-amber-600 dark:text-amber-400' : ''}`}>{value ?? 0}</div>
        )}
        {onClick && !isLoading && (
          <p className="text-xs text-muted-foreground mt-1">Click to view →</p>
        )}
      </CardContent>
    </Card>
  );
}

function ActivityIcon({ action }: { action: string }) {
  switch (action) {
    case 'uploaded':
      return <div className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400"><FileText className="h-4 w-4" /></div>;
    case 'signed':
      return <div className="h-8 w-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-green-600 dark:text-green-400"><CheckCircle className="h-4 w-4" /></div>;
    case 'rejected':
      return <div className="h-8 w-8 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-red-600 dark:text-red-400"><XCircle className="h-4 w-4" /></div>;
    case 'viewed':
      return <div className="h-8 w-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-600 dark:text-gray-400"><Clock className="h-4 w-4" /></div>;
    default:
      return <div className="h-8 w-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-600 dark:text-gray-400"><Activity className="h-4 w-4" /></div>;
  }
}
