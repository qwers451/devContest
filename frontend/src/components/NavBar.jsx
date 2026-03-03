import React, { useContext } from 'react';
import { Context } from "../main.jsx";
import { NavLink, useNavigate } from "react-router-dom";
import { CONTESTS_ROUTE, ADMIN_ROUTE, LOGIN_ROUTE, MY_SOLUTIONS_ROUTE, MY_CONTESTS_ROUTE, CREATE_CONTEST_ROUTE, PROFILE_ROUTE } from "../utils/consts.js";
import { Navbar, Nav, Container, Button } from 'react-bootstrap';
import { observer } from "mobx-react-lite";
import logo from '../../assets/logo.svg';

const NavBar = () => {
    const { user } = useContext(Context);
    const navigate = useNavigate();

    const logOut = () => {
        user.setUser({});
        user.setIsAuth(false);
        navigate(CONTESTS_ROUTE); // или просто "/"
    };

    return (
        <Navbar variant="dark" expand="lg" className="mb-4" style={{ backgroundColor: '#543787' }}>
            <Container>
                <Navbar.Brand as={NavLink} to={CONTESTS_ROUTE} style={{ display: 'flex', alignItems: 'center' }}>
                    <img src={logo} alt="Logo" style={{ height: '30px', marginRight: '10px' }} />
                    <span>DevContest</span>
                </Navbar.Brand>
                <Navbar.Toggle aria-controls="basic-navbar-nav" />
                <Navbar.Collapse id="basic-navbar-nav">
                    <Nav className="ms-auto">
                        {user.isAuth ? (
                            <>
                                {/* Если пользователь Админ (role: 3) */}
                                {user.user && user.user.role === 3 && (
                                    <NavLink
                                        to={ADMIN_ROUTE}
                                        className="nav-link"
                                        style={({ isActive }) => ({
                                            color: isActive ? '#fff' : '#E1D6F3', // Белый для активной, светло-фиолетовый для неактивной
                                            textDecoration: 'none',
                                            padding: '10px 15px',
                                            borderRadius: '5px',
                                            transition: 'background-color 0.3s, color 0.3s',
                                            backgroundColor: isActive ? '#7A3E9F' : 'transparent'
                                        })}
                                    >
                                        Админ панель
                                    </NavLink>
                                )}
                                {/* Если пользователь Фрилансер (role: 1) */}
                                {user.user && user.user.role === 1 && (
                                    <NavLink
                                        to={MY_SOLUTIONS_ROUTE}
                                        className="nav-link"
                                        style={({ isActive }) => ({
                                            color: isActive ? '#fff' : '#E1D6F3', // Белый для активной, светло-фиолетовый для неактивной
                                            textDecoration: 'none',
                                            padding: '10px 15px',
                                            borderRadius: '5px',
                                            transition: 'background-color 0.3s, color 0.3s',
                                            backgroundColor: isActive ? '#7A3E9F' : 'transparent'
                                        })}
                                    >
                                        Мои решения
                                    </NavLink>
                                )}
                                {/* Если пользователь Организатор (role: 2) */}
                                {user.user && user.user.role === 2 && (
                                    <>
                                        <NavLink
                                            to={MY_CONTESTS_ROUTE}
                                            className="nav-link"
                                            style={({ isActive }) => ({
                                                color: isActive ? '#fff' : '#E1D6F3', // Белый для активной, светло-фиолетовый для неактивной
                                                textDecoration: 'none',
                                                padding: '10px 15px',
                                                borderRadius: '5px',
                                                transition: 'background-color 0.3s, color 0.3s',
                                                backgroundColor: isActive ? '#7A3E9F' : 'transparent'
                                            })}
                                        >
                                            Мои конкурсы
                                        </NavLink>
                                        <NavLink
                                            to={CREATE_CONTEST_ROUTE}
                                            className="nav-link"
                                            style={({ isActive }) => ({
                                                color: isActive ? '#fff' : '#E1D6F3', // Белый для активной, светло-фиолетовый для неактивной
                                                textDecoration: 'none',
                                                padding: '10px 15px',
                                                borderRadius: '5px',
                                                transition: 'background-color 0.3s, color 0.3s',
                                                backgroundColor: isActive ? '#7A3E9F' : 'transparent'
                                            })}
                                        >
                                            Добавить конкурс
                                        </NavLink>
                                    </>
                                )}
                                <Button
                                    variant="outline-light"
                                    className="me-2"
                                    onClick={() => navigate(PROFILE_ROUTE)}
                                >
                                    Профиль
                                </Button>
                                <Button
                                    variant="outline-light"
                                    onClick={logOut}
                                    style={{
                                        color: 'white',
                                        borderColor: 'white',
                                        padding: '10px 15px',
                                        borderRadius: '5px',
                                        transition: 'background-color 0.3s, color 0.3s',
                                    }}
                                >
                                    Выйти
                                </Button>
                            </>
                        ) : (
                            <NavLink
                                to={LOGIN_ROUTE}
                                className="nav-link"
                                style={({ isActive }) => ({
                                    color: isActive ? '#fff' : '#E1D6F3', // Белый для активной, светло-фиолетовый для неактивной
                                    textDecoration: 'none',
                                    padding: '10px 15px',
                                    borderRadius: '5px',
                                    transition: 'background-color 0.3s, color 0.3s',
                                    backgroundColor: isActive ? '#7A3E9F' : 'transparent'
                                })}
                            >
                                Войти
                            </NavLink>
                        )}
                    </Nav>
                </Navbar.Collapse>
            </Container>
        </Navbar>
    );
};

export default observer(NavBar);
