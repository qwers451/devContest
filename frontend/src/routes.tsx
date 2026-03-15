import {
    ADMIN_ROUTE,
    CREATE_CONTEST_ROUTE,
    LOGIN_ROUTE,
    CONTEST_ROUTE,
    CONTESTS_ROUTE,
    REGISTRATION_ROUTE,
    MY_SOLUTIONS_ROUTE,
    MY_CONTESTS_ROUTE,
    CREATE_SOLUTION_ROUTE,
    SOLUTION_ROUTE,
    SOLUTIONS_ROUTE,
    CREATE_REVIEW_ROUTE,
    SOLUTION_REVIEWS_ROUTE,
    REVIEW_ROUTE,
    PROFILE_ROUTE,
    EDIT_ROUTE,
    PAYMENT_CHECKOUT_ROUTE,
    PAYMENT_CALLBACK_ROUTE,
    WALLET_ROUTE,
} from "./utils/consts.js";
import Auth from "./pages/Auth";
import Contests from "./pages/Contests";
import Admin from "./pages/Admin";
import ContestPage from "./pages/ContestPage";
import CreateContest from "./pages/CreateContest";
import CreateSolution from "./pages/CreateSolution";
import MyContests from "./pages/MyContests";
import MySolutions from "./pages/MySolutions";
import Solutions from "./pages/Solutions";
import SolutionPage from "./pages/SolutionPage";
import CreateReview from "./pages/CreateReview";
import SolutionReviews from "./pages/SolutionReviews";
import ReviewPage from './pages/ReviewPage';
import ProfilePage from "./pages/ProfilePage";
import PaymentCheckoutPage from "./pages/PaymentCheckoutPage";
import PaymentCallbackPage from "./pages/PaymentCallbackPage";
import WalletPage from "./pages/WalletPage";

export const authRoutes = [
    {
        path: ADMIN_ROUTE,
        element: <Admin />
    },
    {
        path: CREATE_CONTEST_ROUTE,
        element: <CreateContest />
    },
    {
        path: CONTEST_ROUTE + '/edit/:id',
        element: <CreateContest />
    },
    {
        path: MY_SOLUTIONS_ROUTE,
        element: <MySolutions />
    },
    {
        path: CONTEST_ROUTE + '/:number' + CREATE_SOLUTION_ROUTE,
        element: <CreateSolution />
    },
    {
        path: SOLUTION_ROUTE + '/:number' + EDIT_ROUTE,
        element: <CreateSolution />
    },
    {
        path: MY_CONTESTS_ROUTE,
        element: <MyContests />
    },
    {
        path: CONTEST_ROUTE + '/:number' + SOLUTIONS_ROUTE,
        element: <Solutions />
    },
    {
        path: SOLUTION_ROUTE + '/:number',
        element: <SolutionPage />
    },
    {
        path: CREATE_REVIEW_ROUTE,
        element: <CreateReview />
    },
    {
        path: SOLUTION_REVIEWS_ROUTE,
        element: <SolutionReviews />
    },
    {
        path: REVIEW_ROUTE,
        element: <ReviewPage />
    },
    {
        path: PROFILE_ROUTE,
        element: <ProfilePage />
    },
    {
        path: PAYMENT_CHECKOUT_ROUTE,
        element: <PaymentCheckoutPage />
    },
    {
        path: WALLET_ROUTE,
        element: <WalletPage />
    },
]

export const publicRoutes = [
    {
        path: CONTESTS_ROUTE,
        element: <Contests />
    },
    {
        path: LOGIN_ROUTE,
        element: <Auth />
    },
    {
        path: REGISTRATION_ROUTE,
        element: <Auth />
    },
    {
        path: CONTEST_ROUTE + '/:number',
        element: <ContestPage />
    },
    {
        path: PAYMENT_CALLBACK_ROUTE,
        element: <PaymentCallbackPage />
    },
]
