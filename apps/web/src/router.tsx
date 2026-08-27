import { createBrowserRouter } from 'react-router-dom';

import { LazyRouteBoundary } from './components/LazyRouteBoundary.js';
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
 *
 * Every lazy child route also gets its own `errorElement: <LazyRouteBoundary />`
 * (B-158) so a single route's render crash — or a stale client's `lazy` import
 * 404ing against a post-deploy chunk hash — only replaces that route's `<Outlet />`
 * slot. `RouteErrorBoundary` on the root stays as the fallback for errors in
 * `RootLayout` itself, which has no ancestor `errorElement` to bubble to.
 */
export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    errorElement: <RouteErrorBoundary />,
    children: [
      {
        path: 'report',
        lazy: () => import('./routes/ReportRoute.js').then((m) => ({ Component: m.ReportRoute })),
        errorElement: <LazyRouteBoundary />,
      },
      {
        index: true,
        lazy: () => import('./routes/HomeRoute.js').then((m) => ({ Component: m.HomeRoute })),
        errorElement: <LazyRouteBoundary />,
      },
      {
        path: 'login',
        lazy: () => import('./routes/LoginRoute.js').then((m) => ({ Component: m.LoginRoute })),
        errorElement: <LazyRouteBoundary />,
      },
      {
        path: 'register',
        lazy: () =>
          import('./routes/RegisterRoute.js').then((m) => ({ Component: m.RegisterRoute })),
        errorElement: <LazyRouteBoundary />,
      },
      {
        path: 'search',
        lazy: () => import('./routes/SearchRoute.js').then((m) => ({ Component: m.SearchRoute })),
        errorElement: <LazyRouteBoundary />,
      },
      {
        path: 'p/:id',
        lazy: () => import('./routes/ThreadRoute.js').then((m) => ({ Component: m.ThreadRoute })),
        errorElement: <LazyRouteBoundary />,
      },
      {
        path: 'page/:handle',
        lazy: () => import('./routes/PageRoute.js').then((m) => ({ Component: m.PageRoute })),
        errorElement: <LazyRouteBoundary />,
      },
      {
        path: 'page/:handle/:slug',
        lazy: () => import('./routes/PageRoute.js').then((m) => ({ Component: m.PageRoute })),
        errorElement: <LazyRouteBoundary />,
      },
      {
        path: ':handle',
        lazy: () => import('./routes/ProfileRoute.js').then((m) => ({ Component: m.ProfileRoute })),
        errorElement: <LazyRouteBoundary />,
      },
      {
        path: 't/:tag',
        lazy: () => import('./routes/TagRoute.js').then((m) => ({ Component: m.TagRoute })),
        errorElement: <LazyRouteBoundary />,
      },
      {
        path: 'c/:id',
        lazy: () =>
          import('./routes/CommunityRoute.js').then((m) => ({ Component: m.CommunityRoute })),
        errorElement: <LazyRouteBoundary />,
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
        errorElement: <LazyRouteBoundary />,
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
        errorElement: <LazyRouteBoundary />,
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
        errorElement: <LazyRouteBoundary />,
      },
      {
        path: 'settings',
        lazy: () =>
          import('./routes/settings/SettingsLayout.js').then((m) => ({
            Component: () => (
              <ProtectedRoute>
                <m.SettingsLayout />
              </ProtectedRoute>
            ),
          })),
        errorElement: <LazyRouteBoundary />,
        children: [
          {
            path: 'profile',
            lazy: () =>
              import('./routes/SettingsProfileRoute.js').then((m) => ({
                Component: m.SettingsProfileRoute,
              })),
            errorElement: <LazyRouteBoundary />,
          },
          {
            path: 'appearance',
            lazy: () =>
              import('./routes/settings/AppearanceSettingsRoute.js').then((m) => ({
                Component: m.AppearanceSettingsRoute,
              })),
            errorElement: <LazyRouteBoundary />,
          },
          {
            path: 'privacy',
            lazy: () =>
              import('./routes/settings/PrivacySettingsRoute.js').then((m) => ({
                Component: m.PrivacySettingsRoute,
              })),
            errorElement: <LazyRouteBoundary />,
          },
          {
            path: 'filters',
            lazy: () =>
              import('./routes/settings/FiltersSettingsRoute.js').then((m) => ({
                Component: m.FiltersSettingsRoute,
              })),
            errorElement: <LazyRouteBoundary />,
          },
          {
            path: 'lists',
            lazy: () =>
              import('./routes/settings/FilterListsSettingsRoute.js').then((m) => ({
                Component: m.FilterListsSettingsRoute,
              })),
            errorElement: <LazyRouteBoundary />,
          },
          {
            path: 'labelers',
            lazy: () =>
              import('./routes/settings/LabelersSettingsRoute.js').then((m) => ({
                Component: m.LabelersSettingsRoute,
              })),
            errorElement: <LazyRouteBoundary />,
          },
          {
            path: 'credentials',
            lazy: () =>
              import('./routes/settings/CredentialsRoute.js').then((m) => ({
                Component: m.CredentialsRoute,
              })),
            errorElement: <LazyRouteBoundary />,
          },
          {
            path: 'devices',
            lazy: () =>
              import('./routes/settings/DevicesRoute.js').then((m) => ({
                Component: m.DevicesRoute,
              })),
            errorElement: <LazyRouteBoundary />,
          },
        ],
      },
      {
        path: 'moderation/log',
        lazy: () =>
          import('./routes/moderation/ModerationLogRoute.js').then((m) => ({
            Component: m.ModerationLogRoute,
          })),
        errorElement: <LazyRouteBoundary />,
      },
      {
        path: 'appeals',
        lazy: () =>
          import('./routes/AppealsRoute.js').then((m) => ({
            Component: () => (
              <ProtectedRoute>
                <m.AppealsRoute />
              </ProtectedRoute>
            ),
          })),
        errorElement: <LazyRouteBoundary />,
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
        errorElement: <LazyRouteBoundary />,
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
        errorElement: <LazyRouteBoundary />,
      },
      { path: '*', element: <NotFoundRoute /> },
    ],
  },
]);
