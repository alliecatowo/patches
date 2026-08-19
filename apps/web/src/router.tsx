import { createBrowserRouter } from 'react-router-dom';

import { ProtectedRoute } from './components/ProtectedRoute.js';
import { BookmarksRoute } from './routes/BookmarksRoute.js';
import { ComposeRoute } from './routes/ComposeRoute.js';
import { CommunityRoute } from './routes/CommunityRoute.js';
import { HomeRoute } from './routes/HomeRoute.js';
import { LoginRoute } from './routes/LoginRoute.js';
import { MessageThreadRoute } from './routes/MessageThreadRoute.js';
import { MessagesRoute } from './routes/MessagesRoute.js';
import { NotFoundRoute, RouteErrorBoundary } from './routes/NotFoundRoute.js';
import { NotificationsRoute } from './routes/NotificationsRoute.js';
import { ProfileRoute } from './routes/ProfileRoute.js';
import { RegisterRoute } from './routes/RegisterRoute.js';
import { RootLayout } from './routes/RootLayout.js';
import { SearchRoute } from './routes/SearchRoute.js';
import { SettingsProfileRoute } from './routes/SettingsProfileRoute.js';
import { TagRoute } from './routes/TagRoute.js';
import { ThreadRoute } from './routes/ThreadRoute.js';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    errorElement: <RouteErrorBoundary />,
    children: [
      { index: true, element: <HomeRoute /> },
      { path: 'login', element: <LoginRoute /> },
      { path: 'register', element: <RegisterRoute /> },
      { path: 'search', element: <SearchRoute /> },
      { path: 'p/:id', element: <ThreadRoute /> },
      { path: '@:handle', element: <ProfileRoute /> },
      { path: 't/:tag', element: <TagRoute /> },
      { path: 'c/:id', element: <CommunityRoute /> },
      {
        path: 'notifications',
        element: (
          <ProtectedRoute>
            <NotificationsRoute />
          </ProtectedRoute>
        ),
      },
      {
        path: 'bookmarks',
        element: (
          <ProtectedRoute>
            <BookmarksRoute />
          </ProtectedRoute>
        ),
      },
      {
        path: 'compose',
        element: (
          <ProtectedRoute>
            <ComposeRoute />
          </ProtectedRoute>
        ),
      },
      {
        path: 'settings/profile',
        element: (
          <ProtectedRoute>
            <SettingsProfileRoute />
          </ProtectedRoute>
        ),
      },
      {
        path: 'messages',
        element: (
          <ProtectedRoute>
            <MessagesRoute />
          </ProtectedRoute>
        ),
      },
      {
        path: 'messages/:id',
        element: (
          <ProtectedRoute>
            <MessageThreadRoute />
          </ProtectedRoute>
        ),
      },
      { path: '*', element: <NotFoundRoute /> },
    ],
  },
]);
