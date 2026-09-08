import { createBrowserRouter, Navigate, RouterProvider } from 'react-router';
import { Layout } from './components/Layout';
import { EmptyState } from './components/ui';
import { LinksPage } from './pages/LinksPage';

const router = createBrowserRouter(
  [
    {
      element: <Layout />,
      children: [
        { index: true, element: <Navigate to="/links" replace /> },
        { path: 'links', element: <LinksPage /> },
        { path: '*', element: <EmptyState title="Page not found" /> },
      ],
    },
  ],
  { basename: '/admin' },
);

export function App() {
  return <RouterProvider router={router} />;
}
