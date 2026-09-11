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

New file added by Handicraft: route for /status-monitor.

Deliberately NOT guarded by a redirect: an anonymous visitor must be able
to reach the page and see the sign-in prompt. Only the data endpoint is
access-controlled (middleware.UserAuth on the backend).
--------------------------------------------------------------------------
*/
import { createFileRoute } from '@tanstack/react-router'

import { StatusMonitor } from '@/features/status-monitor'

export const Route = createFileRoute('/status-monitor/')({
  component: StatusMonitor,
})
