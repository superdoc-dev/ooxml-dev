import { Route, Routes } from "react-router-dom";
import { DocsLayout } from "./pages/docs/Layout";
import { DocsPage } from "./pages/docs/Page";
import { Home } from "./pages/Home";

function App() {
	return (
		<Routes>
			<Route path="/" element={<Home />} />
			<Route path="/docs" element={<DocsLayout />}>
				<Route index element={<DocsPage slug="index" />} />
				<Route path="*" element={<DocsPage />} />
			</Route>
		</Routes>
	);
}

export default App;
