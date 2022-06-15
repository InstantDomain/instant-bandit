import Head from "next/head"
import { GetServerSideProps } from "next"
import { useCallback } from "react"

import { Default } from "../components/Default"
import { InstantBanditOptions } from "../lib/types"
import { Variant } from "../components/Variant"
import { useInstantBandit } from "../lib/hooks"
import { HEADER_SESSION_ID } from "../lib/constants"
import { getDefaultServer } from "../lib/server/helpers"
import styles from "../styles/Home.module.css"


const siteName = "demo"

export default function Home(serverSideProps: InstantBanditOptions) {
  return (
    <div className={styles.container}>
      <Head>
        <title>Instant Bandit</title>
        <meta name="description" content="Generated by create next app" />
        <link
          rel="icon"
          // See https://css-tricks.com/emojis-as-favicons/
          href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>⚔️</text></svg>"
        />
        <link rel="preload" href={`/api/sites/${siteName}`} as="fetch" crossOrigin="anonymous" />
      </Head>


      <main className={styles.main}>
        <h1 className={styles.header}>Welcome to Instant Bandit</h1>

        <Default>
          <h2>You are currently viewing the default variant</h2>
          <SignUpButton>Add Conversion</SignUpButton>
        </Default>

        <Variant name="A">
          <h2>You are currently viewing variant A</h2>
          <SignUpButton>Add Conversion</SignUpButton>
        </Variant>

        <Variant name="B">
          <h2>You are currently viewing variant B</h2>
          <SignUpButton>Add Conversion</SignUpButton>
        </Variant>

        <Variant name="C">
          <h2>You are currently viewing variant C</h2>
          <SignUpButton>Add Conversion</SignUpButton>
        </Variant>
      </main>

      <footer className={styles.footer}>
        <button onClick={() => {
          localStorage.clear()
          document.cookie = `${HEADER_SESSION_ID}=""`
          location.reload()
        }}>Clear Session and Reload</button>
      </footer>
    </div>

  )
}

export function SignUpButton(props) {
  const ctx = useInstantBandit()
  const { site, metrics, experiment, variant } = ctx

  const onClick = useCallback(() => {
    metrics.sinkEvent(ctx, "conversions")
  }, [site, experiment, variant])

  return (
    <button className={styles[variant.name]} onClick={onClick}>{props.children}</button>
  )
}


// Comment out to have loading done in the browser
/*
export const getServerSideProps: GetServerSideProps = async (context) => {
  const server = getDefaultServer()
  const { req, res } = context
  const { site, select } = await serverSideRenderedSite(server, siteName, req, res)

  return {
    props: {
      site,
      siteName,
      select,
    }
  }
}
*/