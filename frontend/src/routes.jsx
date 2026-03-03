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
    EDIT_ROUTE
} from "./utils/consts.js";
import Auth from "./pages/Auth.jsx";
import Contests from "./pages/Contests.jsx";
import Admin from "./pages/Admin.jsx";
import ContestPage from "./pages/ContestPage.jsx";
import CreateContest from "./pages/CreateContest.jsx";
import CreateSolution from "./pages/CreateSolution.jsx";
import MyContests from "./pages/MyContests.jsx";
import MySolutions from "./pages/MySolutions.jsx";
import Solutions from "./pages/Solutions.jsx";
import SolutionPage from "./pages/SolutionPage.jsx";
import CreateReview from "./pages/CreateReview.jsx";
import SolutionReviews from "./pages/SolutionReviews.jsx";
import ReviewPage from './pages/ReviewPage.jsx';
import ProfilePage from "./pages/ProfilePage.jsx";

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
    }
]
