import { createBrowserRouter } from 'react-router-dom';

import { ProtectedRoute } from './components/ProtectedRoute.js';
import { NotFoundRoute, RouteErrorBoundary } from './routes/NotFoundRoute.js';
import { RootLayout } from './routes/RootLayout.js';

/**
 * Every route page is code-split via react-router's data-router `lazy` route
 * property (v7) instead of a plain `element`, so the initial bundle only ships
 * the app shell (`RootLayout`, `ProtectedRoute`, `NotFoundRoute`) — each route's
 * own chunk, plus whatever it imports, loads on navigation. `ProtectedRoute`-
 * wrapped routes wrap the lazily-imported component in their `Component`
 * result rather than importing `ProtectedRoute` per chunk, since it's already
 * part of the shell.
 */
export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    errorElement: <RouteErrorBoundary />,
    children: [
      {
        index: true,
        lazy: () => import('./routes/HomeRoute.js').then((m) => ({ Component: m.HomeRoute })),
      },
      {
        path: 'login',
        lazy: () => import('./routes/LoginRoute.js').then((m) => ({ Component: m.LoginRoute })),
      },
      {
        path: 'register',
        lazy: () =>
          import('./routes/RegisterRoute.js').then((m) => ({ Component: m.RegisterRoute })),
      },
      {
        path: 'search',
        lazy: () => import('./routes/SearchRoute.js').then((m) => ({ Component: m.SearchRoute })),
      },
      {
        path: 'p/:id',
        lazy: () => import('./routes/ThreadRoute.js').then((m) => ({ Component: m.ThreadRoute })),
      },
      {
        path: '@:handle',
        lazy: () => import('./routes/ProfileRoute.js').then((m) => ({ Component: m.ProfileRoute })),
      },
      {
        path: 't/:tag',
        lazy: () => import('./routes/TagRoute.js').then((m) => ({ Component: m.TagRoute })),
      },
      {
        path: 'c/:id',
        lazy: () =>
          import('./routes/CommunityRoute.js').then((m) => ({ Component: m.CommunityRoute })),
      },
      {
        path: 'notifications',
        lazy: () =>
          import('./routes/NotificationsRoute.js').then((m) => ({
            Component: () => (
              <ProtectedRoute>
                <m.NotificationsRoute />
              </ProtectedRoute>
            ),
          })),
      },
      {
        path: 'bookmarks',
        lazy: () =>
          import('./routes/BookmarksRoute.js').then((m) => ({
            Component: () => (
              <ProtectedRoute>
                <m.BookmarksRoute />
              </ProtectedRoute>
            ),
          })),
      },
      {
        path: 'compose',
        lazy: () =>
          import('./routes/ComposeRoute.js').then((m) => ({
            Component: () => (
              <ProtectedRoute>
                <m.ComposeRoute />
              </ProtectedRoute>
            ),
          })),
      },
      {
        path: 'settings/profile',
        lazy: () =>
          import('./routes/SettingsProfileRoute.js').then((m) => ({
            Component: () => (
              <ProtectedRoute>
                <m.SettingsProfileRoute />
              </ProtectedRoute>
            ),
          })),
      },
      {
        path: 'messages',
        lazy: () =>
          import('./routes/MessagesRoute.js').then((m) => ({
            Component: () => (
              <ProtectedRoute>
                <m.MessagesRoute />
              </ProtectedRoute>
            ),
          })),
      },
      {
        path: 'messages/:id',
        lazy: () =>
          import('./routes/MessageThreadRoute.js').then((m) => ({
            Component: () => (
              <ProtectedRoute>
                <m.MessageThreadRoute />
              </ProtectedRoute>
            ),
          })),
      },
      { path: '*', element: <NotFoundRoute /> },
    ],
  },
]);
