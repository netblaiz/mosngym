'use client'

import { useState }        from 'react'
import { useRouter }       from 'next/navigation'
import { useForm }         from 'react-hook-form'
import { zodResolver }     from '@hookform/resolvers/zod'
import { z }               from 'zod'
import { Dumbbell, Eye, EyeOff, Loader2 } from 'lucide-react'
import { Button }          from '@/components/ui/button'
import { Input }           from '@/components/ui/input'
import { Label }           from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuthStore }    from '@/store/auth.store'
import { getApiError }     from '@/lib/api'
import { cn }              from '@/lib/utils'

// ─── Schema ───────────────────────────────────────────────────────────────────

const loginSchema = z.object({
  email:    z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
  gymSlug:  z.string().min(1, 'Gym slug is required'),
})
type LoginForm = z.infer<typeof loginSchema>

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LoginPage() {
  const router          = useRouter()
  const { login }       = useAuthStore()
  const [showPass, setShowPass] = useState(false)
  const [error, setError]       = useState<string | null>(null)

  const form = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email:    '',
      password: '',
      gymSlug:  'benfit-lagos',
    },
  })

  const onSubmit = async (values: LoginForm) => {
    setError(null)
    try {
      await login(values.email, values.password, values.gymSlug)
      router.push('/dashboard')
    } catch (err) {
      setError(getApiError(err))
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">

        {/* Logo */}
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-primary">
            <Dumbbell className="w-6 h-6 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold">Mosn Gym</h1>
          <p className="text-muted-foreground text-sm">Sign in to your dashboard</p>
        </div>

        {/* Card */}
        <Card>
          <CardHeader>
            <CardTitle>Welcome back</CardTitle>
            <CardDescription>Enter your credentials to continue</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">

              {/* Error */}
              {error && (
                <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                  {error}
                </div>
              )}

              {/* Gym slug */}
              <div className="space-y-1.5">
                <Label htmlFor="gymSlug">Gym</Label>
                <Input
                  id="gymSlug"
                  placeholder="your-gym-slug"
                  {...form.register('gymSlug')}
                  className={cn(form.formState.errors.gymSlug && 'border-destructive')}
                />
                {form.formState.errors.gymSlug && (
                  <p className="text-xs text-destructive">{form.formState.errors.gymSlug.message}</p>
                )}
              </div>

              {/* Email */}
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  {...form.register('email')}
                  className={cn(form.formState.errors.email && 'border-destructive')}
                />
                {form.formState.errors.email && (
                  <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
                )}
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPass ? 'text' : 'password'}
                    placeholder="••••••••"
                    {...form.register('password')}
                    className={cn(
                      'pr-10',
                      form.formState.errors.password && 'border-destructive'
                    )}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(p => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {form.formState.errors.password && (
                  <p className="text-xs text-destructive">{form.formState.errors.password.message}</p>
                )}
              </div>

              {/* Forgot password */}
              <div className="flex justify-end">
                <a href="/forgot-password" className="text-xs text-muted-foreground hover:text-primary">
                  Forgot password?
                </a>
              </div>

              {/* Submit */}
              <Button
                type="submit"
                className="w-full"
                disabled={form.formState.isSubmitting}
              >
                {form.formState.isSubmitting
                  ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Signing in...</>
                  : 'Sign in'
                }
              </Button>

            </form>
          </CardContent>
        </Card>

      </div>
    </div>
  )
}
