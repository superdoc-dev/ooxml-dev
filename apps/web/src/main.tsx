import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, Outlet, RouterProvider } from "react-router-dom";
import { DocsLayout } from "./pages/docs/Layout";
import { DocsPage } from "./pages/docs/Page";
import { Home } from "./pages/Home";
import { Mcp } from "./pages/Mcp";
import "./index.css";

const router = createBrowserRouter([
	{
		element: <Outlet />,
		children: [
			{ path: "/", element: <Home /> },
			{ path: "/mcp", element: <Mcp /> },
			{
				path: "/docs",
				element: <DocsLayout />,
				children: [
					{ index: true, element: <DocsPage slug="index" /> },
					{ path: "*", element: <DocsPage /> },
				],
			},
		],
	},
]);

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<RouterProvider router={router} />
	</StrictMode>,
);
