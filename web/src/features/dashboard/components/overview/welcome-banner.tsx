/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com

--------------------------------------------------------------------------
Modifications for Handicraft — 2026-09-11

New file added by Handicraft (not present upstream): a welcome banner shown
at the top of the dashboard overview.

To use custom artwork, drop an image at `web/public/welcome-banner.jpg`.
It is layered over a theme-aware gradient and fades out toward the left so
the greeting text stays legible in both light and dark themes. When the
file is absent the gradient alone is rendered — no error state, no layout
shift.

The shipped artwork is pre-cropped to 2560x420 (6.1:1) and centred on the
characters' heads, because the artwork layer below is the right 60% of the
banner (~6.9:1). Match that aspect if you replace it, otherwise `bg-cover`
will crop the subject.
--------------------------------------------------------------------------
*/
import { useId } from 'react'
import { useTranslation } from 'react-i18next'

import { useAuthStore } from '@/stores/auth-store'

/**
 * Product lockup. Brand and product names are intentionally not translated,
 * so this stays a plain constant rather than an i18n key. Change it here to
 * rebrand the banner.
 */
const BRAND_EYEBROW = 'Handicraft · 手工API'

/**
 * Runtime path of the optional banner artwork. The file is served from
 * `web/public/`, so it is resolvable at request time without being imported
 * (which would fail the build while the asset does not exist yet).
 */
const BANNER_ARTWORK_URL = '/welcome-banner.jpg'

export function WelcomeBanner() {
  const { t } = useTranslation()
  const headingId = useId()
  const user = useAuthStore((state) => state.auth.user)

  const name = (user?.display_name?.trim() || user?.username?.trim()) ?? ''

  return (
    <section
      aria-labelledby={headingId}
      className='bg-card relative isolate overflow-hidden rounded-2xl border shadow-xs'
    >
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_58%_150%_at_86%_0%,color-mix(in_oklch,var(--overview-accent-1)_20%,transparent)_0%,transparent_66%),linear-gradient(104deg,color-mix(in_oklch,var(--card)_96%,var(--overview-accent-2)_9%)_0%,color-mix(in_oklch,var(--card)_96%,var(--overview-accent-3)_9%)_52%,color-mix(in_oklch,var(--background)_88%,var(--overview-accent-1)_13%)_100%)]'
      />

      <div
        aria-hidden='true'
        style={{ backgroundImage: `url(${BANNER_ARTWORK_URL})` }}
        className='pointer-events-none absolute inset-y-0 right-0 hidden w-3/5 bg-cover bg-center [mask-image:linear-gradient(90deg,transparent_0%,black_42%,black_100%)] sm:block'
      />

      {/* Legibility scrim. Tuned to be fully transparent by 64% so the artwork
          layer (which reaches full opacity at ~65% of the banner) is never
          washed out where the characters sit. */}
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,var(--card)_0%,color-mix(in_oklch,var(--card)_88%,transparent)_36%,transparent_64%)]'
      />

      <div className='relative flex min-h-28 flex-col justify-center gap-1 px-5 py-5 sm:min-h-36 sm:px-7 sm:py-6'>
        <p className='text-muted-foreground text-[0.6875rem] font-medium tracking-[0.22em] uppercase sm:text-xs'>
          {BRAND_EYEBROW}
        </p>
        <h2
          id={headingId}
          className='text-foreground text-xl font-semibold tracking-tight text-balance sm:text-2xl'
        >
          {name
            ? t('Welcome back, {{name}}', { name })
            : t('Welcome back')}
        </h2>
      </div>
    </section>
  )
}
