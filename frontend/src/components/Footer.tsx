import { Link } from "react-router-dom";
import { ABOUT_ROUTE } from "../utils/consts.js";

const Footer = () => (
  <footer className="border-t border-gray-700 bg-gray-950">
    <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-[12px] text-gray-500">
      <span>© {new Date().getFullYear()} DevContest</span>
      <Link to={ABOUT_ROUTE} className="hover:text-gray-300">
        О проекте · При поддержке Фонда содействия инновациям
      </Link>
    </div>
  </footer>
);

export default Footer;
