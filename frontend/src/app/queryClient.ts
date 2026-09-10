import { QueryClient } from "@tanstack/react-query"

// Single app-wide QueryClient. The cache is cleared on login/logout so data
// from one account never leaks into another user's session (query keys do not
// include the username).
export const queryClient = new QueryClient()
