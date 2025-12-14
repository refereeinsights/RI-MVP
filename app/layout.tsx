import React from 'react';

const Layout = ({ children }) => {
  return (
    <html lang="en">
      <head>
        <title>My Next App</title>
      </head>
      <body>
        <header>
          <h1>Welcome to My Next App</h1>
        </header>
        <main>{children}</main>
        <footer>
          <p>&copy; {new Date().getFullYear()} My Next App. All rights reserved.</p>
        </footer>
      </body>
    </html>
  );
};

export default Layout;