import {BrowserRouter} from "react-router-dom";
import AppRouter from "./components/AppRouter";
import NavBar from "./components/NavBar";
import Toaster from "./components/Toaster";

function App() {
    return (
        <BrowserRouter>
            <NavBar />
            <AppRouter />
            <Toaster />
        </BrowserRouter>
    )
}

export default App
