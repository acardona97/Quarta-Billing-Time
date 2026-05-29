import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const attorneys = [
  { email: 'agomez@quarta.co', name: 'Alejandro Gómez' },
  { email: 'secheverri@quarta.co', name: 'Sebastián Echeverri' },
  { email: 'mgaviria@quarta.co', name: 'María Gaviria' },
  { email: 'ltoro@quarta.co', name: 'Laura Toro' },
  { email: 'marango@quarta.co', name: 'Miguel Arango' },
]

async function main() {
  for (const att of attorneys) {
    console.log(`Creating ${att.email}...`)

    // Create auth user
    const { data, error } = await supabase.auth.admin.createUser({
      email: att.email,
      password: 'Quarta2026!',
      email_confirm: true,
      user_metadata: { full_name: att.name }
    })

    if (error) {
      console.log(`  ERROR: ${error.message}`)
      continue
    }

    console.log(`  Auth user created: ${data.user.id}`)

    // Update profile to attorney role (trigger should have created the row)
    const { error: updateErr } = await supabase
      .from('users')
      .update({ role: 'attorney', full_name: att.name })
      .eq('id', data.user.id)

    if (updateErr) {
      console.log(`  Profile update error: ${updateErr.message}`)
    } else {
      console.log(`  Profile set to attorney ✓`)
    }

    // Create user preferences
    const { error: prefErr } = await supabase
      .from('user_preferences')
      .upsert({
        user_id: data.user.id,
        daily_hour_goal: 360,
        default_billable: true,
        notification_push: true,
        notification_email: false,
        theme: 'system',
        self_edit_window_days: 7,
        reconciliation_time: '17:30',
        streak_current: 0,
        streak_best: 0,
      }, { onConflict: 'user_id' })

    if (prefErr) {
      console.log(`  Preferences error: ${prefErr.message}`)
    } else {
      console.log(`  Preferences created ✓`)
    }
  }

  console.log('\nDone! All attorneys can login with password: Quarta2026!')
}

main()
