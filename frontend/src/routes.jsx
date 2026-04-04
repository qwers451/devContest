import { lazy } from 'react';
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

const Auth = lazy(() => import('./pages/Auth'));
const Contests = lazy(() => import('./pages/Contests'));
const Admin = lazy(() => import('./pages/Admin'));
const ContestPage = lazy(() => import('./pages/ContestPage'));
const CreateContest = lazy(() => import('./pages/CreateContest'));
const CreateSolution = lazy(() => import('./pages/CreateSolution'));
const MyContests = lazy(() => import('./pages/MyContests'));
const MySolutions = lazy(() => import('./pages/MySolutions'));
const Solutions = lazy(() => import('./pages/Solutions'));
const SolutionPage = lazy(() => import('./pages/SolutionPage'));
const CreateReview = lazy(() => import('./pages/CreateReview'));
const SolutionReviews = lazy(() => import('./pages/SolutionReviews'));
const ReviewPage = lazy(() => import('./pages/ReviewPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const PaymentCheckoutPage = lazy(() => import('./pages/PaymentCheckoutPage'));
const PaymentCallbackPage = lazy(() => import('./pages/PaymentCallbackPage'));
const WalletPage = lazy(() => import('./pages/WalletPage'));

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
