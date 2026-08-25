'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { GymProfileSettings }      from '@/components/modules/settings/gym-profile-settings'
import { GymOperationSettings }    from '@/components/modules/settings/gym-operation-settings'
import { BillingEnforcementSettings } from '@/components/modules/settings/billing-enforcement-settings'
import { LocationsSettings }       from '@/components/modules/settings/locations-settings'
import { IntegrationsSettings }    from '@/components/modules/settings/integrations-settings'
import { Building2, Settings, CreditCard, MapPin, Plug } from 'lucide-react'

export default function SettingsPage() {
  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Manage your gym profile, billing, and integrations
        </p>
      </div>

      <Tabs defaultValue="profile">
        <TabsList className="grid grid-cols-5 w-full max-w-2xl">
          <TabsTrigger value="profile"   className="gap-1.5"><Building2  className="h-3.5 w-3.5" /> Profile</TabsTrigger>
          <TabsTrigger value="operations" className="gap-1.5"><Settings  className="h-3.5 w-3.5" /> Operations</TabsTrigger>
          <TabsTrigger value="billing"   className="gap-1.5"><CreditCard className="h-3.5 w-3.5" /> Billing</TabsTrigger>
          <TabsTrigger value="locations" className="gap-1.5"><MapPin     className="h-3.5 w-3.5" /> Locations</TabsTrigger>
          <TabsTrigger value="integrations" className="gap-1.5"><Plug   className="h-3.5 w-3.5" /> Integrations</TabsTrigger>
        </TabsList>

        <TabsContent value="profile"      className="mt-6"><GymProfileSettings /></TabsContent>
        <TabsContent value="operations"   className="mt-6"><GymOperationSettings /></TabsContent>
        <TabsContent value="billing"      className="mt-6"><BillingEnforcementSettings /></TabsContent>
        <TabsContent value="locations"    className="mt-6"><LocationsSettings /></TabsContent>
        <TabsContent value="integrations" className="mt-6"><IntegrationsSettings /></TabsContent>
      </Tabs>
    </div>
  )
}
