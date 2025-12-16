# README.md

# My Next.js App

This is a Next.js application built with TypeScript. It serves as a template for creating modern web applications using React and Next.js.

## Project Structure

The project has the following structure:

```
my-next-app
├── app
│   ├── layout.tsx       # Layout component for the application
│   ├── page.tsx         # Main entry point for the application
│   └── globals.css       # Global CSS styles
├── package.json          # NPM configuration file
├── next.config.js        # Next.js configuration file
├── tsconfig.json         # TypeScript configuration file
├── next-env.d.ts         # TypeScript definitions for Next.js
├── .gitignore            # Git ignore file
└── README.md             # Project documentation
```

## Getting Started

To get started with this project, follow these steps:

1. **Clone the repository:**
   ```
   git clone <repository-url>
   cd my-next-app
   ```

2. **Install dependencies:**
   ```
   npm install
   ```

3. **Run the development server:**
   ```
   npm run dev
   ```

4. **Open your browser and navigate to:**
   ```
   http://localhost:3000
   ```

## Scripts

- `dev`: Starts the development server.
- `build`: Builds the application for production.
- `start`: Starts the production server.

## CSV Ingestion Tool

Use `tsx scripts/ingest-csv.ts [options] <path-to-csv>` to push tournament rows from a CSV into Supabase.

- Columns must include `name`, `state`, `source_url`, and either a `source` column or `--source=<source>` CLI flag. Optional columns (city, level, start_date, end_date, etc.) will be picked up automatically.
- Run with `--dry-run` first to validate rows without writing: `tsx scripts/ingest-csv.ts --dry-run --source=us_club_soccer ./path/to/file.csv`.
- Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in your environment before running without `--dry-run`.

## Contributing

Feel free to submit issues and pull requests to improve this project. 

## License

This project is licensed under the MIT License.
