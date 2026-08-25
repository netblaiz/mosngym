'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { OverviewTab }   from '@/components/modules/analytics/overview-tab'
import { RevenueTab }    from '@/components/modules/analytics/revenue-tab'
import { MembersTab }    from '@/components/modules/analytics/members-tab'
import { ClassesTab }    from '@/components/modules/analytics/classes-tab'
import { RetentionTab }  from '@/components/modules/analytics/retention-tab'
import { Button } from '@/components/ui/button'
import { Download } from 'lucide-react'
import { notify } from '@/lib/toast'

export default function AnalyticsPage() {
  const [exportLoading, setExportLoading] = useState(false)

  const { data: overviewData, isLoading: overviewLoading } = useQuery({
    queryKey: ['analytics-overview'],
    queryFn: () => api.get('/analytics/overview').then(r => r.data),
    refetchInterval: 60_000, // refresh every minute
  })

  const { data: revenueData, isLoading: revenueLoading } = useQuery({
    queryKey: ['analytics-revenue'],
    queryFn: () => api.get('/analytics/revenue').then(r => r.data),
  })

  const { data: membersData, isLoading: membersLoading } = useQuery({
    queryKey: ['analytics-members'],
    queryFn: () => api.get('/analytics/members').then(r => r.data),
  })

  const { data: classesData, isLoading: classesLoading } = useQuery({
    queryKey: ['analytics-classes'],
    queryFn: () => api.get('/analytics/classes').then(r => r.data),
  })

  const { data: retentionData, isLoading: retentionLoading } = useQuery({
    queryKey: ['analytics-retention'],
    queryFn: () => api.get('/analytics/retention').then(r => r.data),
  })

  async function handleExport() {
    setExportLoading(true)
    try {
      await api.post('/analytics/export', {
        type:   'overview',
        format: 'csv',
      })
      notify.success('Export queued', 'You will receive an email when it is ready')
    } catch {
      notify.error('Export failed')
    } finally {
      setExportLoading(false)
    }
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Analytics</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Track revenue, members, classes and retention
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleExport} disabled={exportLoading}>
          <Download className="h-4 w-4 mr-2" />
          {exportLoading ? 'Queuing…' : 'Export Report'}
        </Button>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="grid grid-cols-5 w-full max-w-2xl">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="revenue">Revenue</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="classes">Classes</TabsTrigger>
          <TabsTrigger value="retention">Retention</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <OverviewTab data={overviewData?.data} isLoading={overviewLoading} />
        </TabsContent>

        <TabsContent value="revenue" className="mt-6">
          <RevenueTab data={revenueData?.data} isLoading={revenueLoading} />
        </TabsContent>

        <TabsContent value="members" className="mt-6">
          <MembersTab data={membersData?.data} isLoading={membersLoading} />
        </TabsContent>

        <TabsContent value="classes" className="mt-6">
          <ClassesTab data={classesData?.data} isLoading={classesLoading} />
        </TabsContent>

        <TabsContent value="retention" className="mt-6">
          <RetentionTab data={retentionData?.data} isLoading={retentionLoading} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
