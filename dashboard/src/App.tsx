import { createBrowserRouter, RouterProvider } from 'react-router';
import { Layout } from './components/Layout';
import { EmptyState, Spinner } from './components/ui';
import { LinksPage } from './pages/LinksPage';

// The chart-heavy pages are split out so the links list doesn't wait on Recharts.
const router = createBrowserRouter(
  [
    {
      element: <Layout />,
      hydrateFallbackElement: <Spinner />,
      children: [
        { index: true, lazy: () => import('./pages/OverviewPage').then((m) => ({ Component: m.OverviewPage })) },
        { path: 'links', element: <LinksPage /> },
        {
          path: 'links/:slug',
          lazy: () => import('./pages/LinkDetailPage').then((m) => ({ Component: m.LinkDetailPage })),
        },
        { path: '*', element: <EmptyState title="Page not found" /> },
      ],
    },
  ],
  { basename: '/admin' },
);

export function App() {
  return <RouterProvider router={router} />;
}
