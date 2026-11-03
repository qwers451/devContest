import {BrowserRouter} from "react-router-dom";
import AppRouter from "./components/AppRouter";
import NavBar from "./components/NavBar";
import Toaster from "./components/Toaster";
import Footer from "./components/Footer";

function App() {
    return (
        <BrowserRouter>
            <NavBar />
            <AppRouter />
            <Footer />
            <Toaster />
        </BrowserRouter>
    )
}

export default App
