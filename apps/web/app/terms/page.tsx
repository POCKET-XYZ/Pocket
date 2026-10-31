import type { Metadata } from 'next';
import Link from 'next/link';
import { POCKET_FEE_PERCENT, TRUSTLESS_WORK_FEE_PERCENT } from '@pocket/shared';
import { LEGAL_EMAIL, LegalPage, ON_MAINNET } from '@/components/legal-page';

export const metadata: Metadata = { title: 'Términos de Servicio' };

/** What the specialist receives of each payment, after both fees. */
const SPECIALIST_SHARE = 100 - POCKET_FEE_PERCENT - TRUSTLESS_WORK_FEE_PERCENT;

/** Percent as written in Spanish, with a decimal comma: 0,3 %. */
const pct = (value: number) => `${String(value).replace('.', ',')} %`;

export default function TermsPage() {
  return (
    <LegalPage
      lang="es"
      title="Términos de Servicio"
      otherLanguage="/terms/en"
      summary={
        <>
          <p className="font-semibold">En resumen</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              Pocket conecta a startups con expertos en growth, ventas y marketing. El
              acuerdo de trabajo es entre ellos. Pocket no es parte de ese acuerdo y no
              emplea a nadie.
            </li>
            <li>
              Los pagos se guardan en contratos inteligentes de garantía (escrow) en la
              red de Stellar. Pocket no guarda tu dinero ni las llaves de tu wallet, pero
              la cuenta de Pocket controla cuándo se libera el dinero guardado y cómo se
              reparte en una disputa.
            </li>
            <li>
              Un hito se paga cuando la startup lo aprueba. Si hay una disputa, la decide
              un manager de Pocket, y esa decisión es final para el dinero guardado.
            </li>
            <li>
              Pocket cobra el {pct(POCKET_FEE_PERCENT)} de cada pago que sale de un
              contrato, y Trustless Work el {pct(TRUSTLESS_WORK_FEE_PERCENT)}. Las dos
              comisiones se descuentan del pago, así que el experto recibe el{' '}
              {pct(SPECIALIST_SHARE)}.
            </li>
            {ON_MAINNET ? (
              <li>
                Pocket funciona en la <strong>red principal</strong> de Stellar: los pagos
                son en USDC real.
              </li>
            ) : (
              <li>
                Este Pocket funciona en la <strong>red de pruebas</strong> de Stellar. El
                USDC de prueba no tiene valor.
              </li>
            )}
            <li>
              Las transacciones en blockchain no se pueden deshacer. Cuida tu wallet y
              revisa lo que firmas.
            </li>
            <li>
              Si eres consumidor, se aplica la ley de protección al consumidor de tu país,
              y nada de lo que dice aquí te quita esos derechos.
            </li>
          </ul>
          <p className="mt-3">
            Este resumen te ayuda a leer los Términos. No los reemplaza.
          </p>
        </>
      }
    >
      <h2>1. Quiénes somos y qué cubren estos Términos</h2>
      <p>
        Pocket (&quot;Pocket&quot;, &quot;nosotros&quot;) es un marketplace en línea
        disponible en pocketgrowth.xyz y en cualquier sitio o app que operemos con el
        nombre Pocket (el &quot;Servicio&quot;). Pocket lo opera su equipo fundador
        mientras se constituye una entidad legal. Cuando exista, esa entidad operará el
        Servicio y será la parte de estos Términos, y la identificaremos aquí con su
        domicilio registrado.
      </p>
      <p>
        Estos Términos de Servicio (los &quot;Términos&quot;) son un acuerdo obligatorio
        entre tú y Pocket. Los aceptas al crear tu cuenta, marcando la casilla que lo
        dice. Nuestra <Link href="/privacy">Política de Privacidad</Link> explica cómo
        tratamos los datos personales. Si no estás de acuerdo con estos Términos, no uses
        el Servicio.
      </p>

      <h2>2. Quién puede usar Pocket</h2>
      <ul>
        <li>Debes tener al menos 18 años y capacidad para celebrar un contrato.</li>
        <li>
          Si usas Pocket en nombre de una empresa, confirmas que puedes obligarla, y
          &quot;tú&quot; incluye a esa empresa.
        </li>
        <li>
          No puedes usar Pocket si estás sujeto a sanciones (ver la sección 13), o si
          usarlo va contra la ley del lugar donde vives.
        </li>
        <li>Una persona o empresa, una cuenta, salvo que acordemos otra cosa.</li>
      </ul>

      <h2>3. Tu cuenta y tu wallet</h2>
      <p>
        Tu wallet de Stellar es tu cuenta. Puedes entrar con una wallet que tú controlas,
        como Freighter, xBull o Lobstr, o a través de Pollar, un servicio de terceros que
        crea una wallet para ti cuando entras con tu correo o con Google.
      </p>
      <ul>
        <li>
          <strong>Tu propia wallet:</strong> solo tú tienes sus llaves. Pocket no puede
          recuperar una llave perdida, revertir una transacción ni mover fondos por ti.
        </li>
        <li>
          <strong>Una wallet de Pollar:</strong> Pollar, un tercero, crea la wallet y
          guarda sus llaves por ti. El acceso depende de tu inicio de sesión en Pollar y
          de su servicio. Pocket no puede acceder, recuperar ni mover fondos de una wallet
          de Pollar. Se aplican los términos y políticas propios de Pollar, si los tiene.
        </li>
        <li>
          Eres responsable de todo lo que se haga con tu cuenta y de mantener seguros tus
          dispositivos, llaves y accesos. Avísanos de inmediato a {LEGAL_EMAIL} si crees
          que alguien más está usando tu cuenta.
        </li>
        <li>
          Eliges tu rol, startup o experto, al crear la cuenta, y no se puede cambiar
          después.
        </li>
      </ul>

      <h2>4. Los datos de tu cuenta</h2>
      <p>
        Antes de publicar trabajos o postularte, completas los datos de tu cuenta: tu
        nombre, un correo de contacto y tu país, y, si eres startup, el nombre de la
        empresa. Tu cuenta queda activa al enviarlos. Te comprometes a dar información
        verdadera, vigente y completa, y a mantenerla al día.
      </p>
      <p>
        Hoy Pocket no verifica la identidad de nadie. Una cuenta activa no es garantía de
        la identidad, las habilidades, la solvencia ni la conducta de nadie, y tampoco es
        una recomendación. Revisa cada perfil y usa tu propio criterio antes de contratar
        o trabajar con alguien. Más adelante podemos pedirte verificar tu identidad con un
        proveedor externo, y te avisaremos antes de hacerlo. Podemos suspender una cuenta
        que dio información falsa (ver la sección 14).
      </p>

      <h2>5. Qué es Pocket y qué no es</h2>
      <p>
        Pocket es un punto de encuentro. Las startups publican trabajos, los expertos se
        postulan, y una startup puede contratar a un experto con los términos e hitos que
        acuerden (un &quot;Contrato&quot;).
      </p>
      <ul>
        <li>El Contrato es entre la startup y el experto. Pocket no es parte de él.</li>
        <li>
          Los expertos son independientes. Pocket no es su empleador, agente ni socio, y
          no dirige ni supervisa su trabajo. El manejo de disputas, los reportes de
          resultados y las funciones del producto no son dirección ni control del trabajo
          de nadie.
        </li>
        <li>
          Cada startup es la única responsable de clasificar correctamente, según la ley
          laboral que le aplique, a las personas que contrata.
        </li>
        <li>
          Pocket no garantiza la calidad, legalidad, tiempos ni resultados de ningún
          trabajo, ni que un trabajo se cubra o una postulación se acepte.
        </li>
        <li>
          Los resultados de una entrega y del reporte de resultados de un contrato los
          reporta el experto y los acepta la startup al aprobar la entrega. Pocket no los
          comprueba. Solo los pagos de un reporte se leen de la blockchain.
        </li>
        <li>
          Cada parte es responsable de emitir las facturas o comprobantes fiscales que
          exija la ley, de cualquier retención de impuestos y de declarar sus propios
          ingresos. Pocket no emite facturas por los Contratos ni retiene impuestos, pero
          puede tener que informar a las autoridades fiscales cuando la ley lo exija.
        </li>
      </ul>

      <h2>6. Pagos y contratos de garantía</h2>
      <h3>Cómo funciona el contrato de garantía</h3>
      <p>
        Cuando una startup contrata a un experto y el experto acepta, se crea un contrato
        inteligente de garantía (escrow) en la red de Stellar a través de Trustless Work,
        un protocolo de garantía de terceros. La startup deposita el monto acordado en
        USDC, una moneda estable emitida por Circle, en ese contrato. El contrato guarda
        el dinero, no Pocket.
      </p>
      <ul>
        <li>
          Cada depósito, aprobación y disputa la firma la wallet del propio usuario.
          Pocket solo firma las transacciones de sus propios roles en el contrato: crear
          el contrato, liberar los hitos aprobados y ejecutar las decisiones de disputas.
          Nunca firma depósitos, aprobaciones ni disputas por ti.
        </li>
        <li>
          Cuando la startup aprueba un hito, Pocket libera el pago de ese hito al experto.
          La aprobación no se puede deshacer: una vez aprobado, el hito se paga y el
          dinero sale del contrato. Al aprobar, la startup confirma que el hito se entregó
          a su satisfacción.
        </li>
        <li>
          No hay liberación automática. Si una startup no aprueba ni disputa un hito, su
          dinero se queda guardado hasta que alguna de las partes abra una disputa.
        </li>
        <li>
          Las liberaciones pueden tardar un poco en firmarse y confirmarse en la red.
        </li>
      </ul>
      <h3>Los roles de Pocket en el contrato</h3>
      <p>
        Pocket no tiene la custodia de tu dinero. Sin embargo, la cuenta de Pocket en
        Stellar tiene los roles del contrato que liberan un hito después de que la startup
        lo aprueba y que resuelven disputas. El propio contrato inteligente ejecutaría
        cualquier resolución de disputa que Pocket firme, incluido un pago a cualquier
        dirección. Pocket se compromete, y sus sistemas están hechos para ello, a dirigir
        el dinero guardado solo a la startup o al experto de ese Contrato, en los montos
        que muestra el Contrato o que se decidan según la sección 7. Si las llaves de la
        cuenta de Pocket se vieran comprometidas, el dinero guardado podría estar en
        riesgo. Pocket protege esas llaves con medidas de seguridad razonables, vigila su
        uso y avisará sin demora a los usuarios afectados de cualquier incidente que
        afecte su dinero.
      </p>
      <h3>Comisiones</h3>
      <p>
        Pocket cobra una comisión del {pct(POCKET_FEE_PERCENT)} de cada monto que paga un
        contrato, en la liberación de un hito o en la resolución de una disputa. Trustless
        Work se queda con el {pct(TRUSTLESS_WORK_FEE_PERCENT)} del mismo monto. El propio
        contrato descuenta las dos comisiones de ese monto, así que el experto recibe el{' '}
        {pct(SPECIALIST_SHARE)} de un hito liberado; en la resolución de una disputa se
        descuentan de la parte de cada uno. Pocket no cobra por publicar trabajos,
        postularse ni depositar. La red de Stellar cobra pequeñas comisiones por
        transacción. Un Contrato conserva las comisiones vigentes cuando se creó su
        contrato de garantía; si nuestras comisiones cambian, mostraremos las nuevas con
        claridad antes de que se apliquen a cualquier Contrato nuevo.
      </p>
      <h3>Pocket no hace reembolsos</h3>
      <p>
        Como Pocket no guarda el dinero, no puede reembolsar, revertir ni devolver un
        pago. El dinero sale de un contrato solo con la liberación de un hito o la
        resolución de una disputa.
      </p>
      <h3>Pagos fuera de Pocket</h3>
      <p>
        Los pagos que se hagan fuera de los contratos de Pocket están fuera del Servicio.
        Pocket no puede ayudar con ellos, no resolverá disputas sobre ellos y no los
        cubren estos Términos.
      </p>

      <h2>7. Disputas entre startups y expertos</h2>
      <p>
        Cualquiera de las partes puede abrir una disputa sobre un hito con dinero
        depositado que no se haya pagado. Su dinero queda guardado en el contrato hasta
        que un manager de Pocket la resuelva. Una disputa es la única forma en que puede
        moverse el dinero de un hito no aprobado.
      </p>
      <ul>
        <li>
          Las dos partes pueden agregar pruebas y comentarios. Cada parte tendrá una
          oportunidad razonable para hacerlo, normalmente 7 días desde que se abre la
          disputa.
        </li>
        <li>
          El manager decide según los términos escritos del Contrato, lo que se entregó y
          las pruebas aportadas, deja por escrito el motivo de su decisión y no tiene
          ningún interés personal en el resultado.
        </li>
        <li>
          El manager puede pagar el hito completo al experto, devolverlo a la startup o
          repartirlo entre los dos. Pocket solo dirigirá el dinero en disputa a esas dos
          partes.
        </li>
        <li>
          La decisión se ejecuta en el contrato y es final para ese dinero. No es un laudo
          arbitral, y no impide que cualquiera de las partes presente un reclamo contra la
          otra ante los tribunales o autoridades competentes.
        </li>
        <li>
          Pocket no es responsable del resultado de una decisión tomada de buena fe según
          esta sección, salvo por su negligencia grave, dolo, o por no ejecutar la
          decisión tal como se tomó.
        </li>
      </ul>

      <h2>8. Riesgos de la blockchain y de terceros</h2>
      <p>Al usar Pocket entiendes y aceptas que:</p>
      <ul>
        <li>
          Las transacciones en blockchain son públicas e irreversibles. Una transacción
          enviada por error, o a una dirección equivocada, no se puede deshacer.
        </li>
        <li>
          Los contratos inteligentes, las redes y las wallets pueden fallar, tener
          errores, sufrir ataques o no estar disponibles, lo que puede retrasar o impedir
          pagos. Las actualizaciones del protocolo, las bifurcaciones o los cambios en los
          contratos de Trustless Work pueden afectar a los contratos de garantía.
        </li>
        <li>
          Los términos de Circle rigen el USDC, y Circle puede congelar el USDC de
          cualquier dirección, incluido un contrato de garantía. Pocket no puede
          descongelar ese dinero. Las monedas estables pueden perder su paridad.
        </li>
        <li>
          Pocket depende de terceros que no controla, entre ellos la red de Stellar,
          Trustless Work, Pollar, Circle, los proveedores de wallets y de hosting. Sus
          servicios se rigen por sus propios términos.
        </li>
        <li>
          Tu dirección de wallet y las transacciones de tus contratos quedan registradas
          en una blockchain pública, donde cualquiera puede verlas y nadie, ni siquiera
          Pocket, puede borrarlas.
        </li>
      </ul>
      <p>
        Pocket no da asesoría financiera, de inversión, legal ni fiscal, y nada en el
        Servicio es una oferta de un producto financiero.
      </p>

      {ON_MAINNET ? (
        <>
          <h2>9. Dinero real</h2>
          <p>
            Pocket funciona en la red principal de Stellar. El USDC que se deposita en un
            contrato es dinero real, y cada liberación, resolución y comisión mueve dinero
            real. Revisa cada monto y cada dirección antes de firmar. Pocket no puede
            devolver USDC enviado a una dirección equivocada, fuera de un contrato o en
            otra red. Las comisiones de la wallet y de la red se pagan en XLM, que también
            tiene valor real. Pocket también puede operar una versión de prueba del
            Servicio, aparte, en la red de pruebas de Stellar; nada de lo que pase ahí
            mueve dinero real.
          </p>
        </>
      ) : (
        <>
          <h2>9. Red de pruebas</h2>
          <p>
            Este Pocket funciona en la red de pruebas de Stellar. El USDC y el XLM de
            prueba no tienen valor y no se pueden cambiar por dinero. Las cuentas, los
            datos y los fondos de prueba pueden reiniciarse. No envíes dinero real ni
            activos de la red principal a ninguna dirección que muestre este Servicio:
            podrían perderse. Ningún Contrato en la red de pruebas obliga a pagar dinero
            real, salvo que las partes lo acuerden fuera de Pocket. Los pagos con dinero
            real solo ocurren en el Pocket que funciona en la red principal de Stellar.
          </p>
        </>
      )}

      <h2>10. Tu contenido</h2>
      <p>
        Tu contenido es lo que agregas a Pocket: tu perfil, CV, portafolio, trabajos,
        postulaciones, entregas y sus resultados, pruebas y comentarios. Sigue siendo
        tuyo.
      </p>
      <ul>
        <li>
          Le das a Pocket una licencia mundial, no exclusiva y gratuita para alojar,
          guardar, copiar, mostrar y procesar tu contenido con el fin de operar, proteger
          y mejorar el Servicio. Esta licencia termina cuando se borra tu contenido, salvo
          las copias que debamos conservar por ley, para resolver disputas o como parte de
          los registros que describe la Política de Privacidad.
        </li>
        <li>
          Cuando tu cuenta está activa, tu perfil público y el CV que subas los puede ver
          cualquiera. Comparte en ellos solo lo que quieras que otros vean.
        </li>
        <li>
          No incluyas en tu perfil ni en tu CV fotos, números de documentos de identidad,
          fecha de nacimiento, datos de salud, creencias religiosas o políticas, ni otros
          datos personales sensibles. Pocket puede quitar ese contenido.
        </li>
        <li>
          Confirmas que tienes los derechos de todo lo que subes, y que no infringe
          derechos de nadie ni viola ninguna ley.
        </li>
        <li>
          Cuando un experto acepta un Contrato, cada parte ve el correo de contacto de la
          otra. Cada una puede usar los datos de la otra solo para ese Contrato, y es
          responsable de tratarlos conforme a la ley.
        </li>
      </ul>

      <h2>11. El resultado del trabajo</h2>
      <p>
        A quién pertenece el trabajo que entrega un experto lo acuerdan la startup y el
        experto. Si no acordaron otra cosa por escrito, cuando un hito se paga por
        completo el experto cede a la startup, en la medida en que la ley aplicable lo
        permita, los derechos patrimoniales sobre lo entregado en ese hito o, donde la
        cesión no esté permitida, le otorga una licencia exclusiva, mundial y perpetua
        sobre ello. Los derechos morales siguen siendo del autor cuando la ley los hace
        irrenunciables. Si una disputa termina en un pago parcial, la startup recibe una
        licencia no exclusiva para usar lo entregado en su propio negocio, salvo que las
        partes acuerden otra cosa. El experto puede mostrar el trabajo en su portafolio,
        salvo que la startup le pida por escrito que no lo haga. Pocket no reclama ningún
        derecho sobre el resultado del trabajo.
      </p>

      <h2>12. Lo que no puedes hacer</h2>
      <ul>
        <li>
          Violar cualquier ley, o usar Pocket para fraude, lavado de dinero o
          financiamiento del terrorismo.
        </li>
        <li>
          Dar información falsa, hacerte pasar por otra persona o crear cuentas para
          alguien más.
        </li>
        <li>
          Acosar, amenazar o discriminar a cualquier persona. Las startups no pueden
          pedir, ni decidir una contratación con base en, raza, origen étnico, color,
          género, orientación sexual, religión, discapacidad, edad, nacionalidad, embarazo
          u otras características protegidas.
        </li>
        <li>
          Publicar trabajos ilegales, mensajes masivos no solicitados, marketing engañoso,
          reseñas falsas, o contenido para adultos, violento o de odio.
        </li>
        <li>
          Subir software malicioso, o cualquier cosa que infrinja la propiedad intelectual
          o la privacidad.
        </li>
        <li>
          Interferir con el Servicio: extraer sus datos de forma automatizada,
          sobrecargarlo, saltarte sus límites o su seguridad, o acceder a cuentas o datos
          que no son tuyos.
        </li>
        <li>
          Probar la seguridad de Pocket sin seguir{' '}
          <a
            href="https://github.com/POCKET-XYZ/Pocket/security/policy"
            target="_blank"
            rel="noreferrer"
          >
            nuestra política de seguridad
          </a>
          , que explica cómo reportar una vulnerabilidad.
        </li>
      </ul>
      <h3>Cómo reportar contenido y cómo moderamos</h3>
      <p>
        Cualquier persona puede reportar contenido o un usuario que crea ilegal o
        contrario a estos Términos escribiendo a {LEGAL_EMAIL}. Incluye dónde está el
        contenido, por qué crees que es ilegal o no está permitido, tu nombre y correo, y
        una declaración de que reportas de buena fe. Revisamos los reportes con personas,
        no con herramientas automáticas, y le decimos a quien reportó lo que decidimos.
      </p>
      <p>
        Si quitamos tu contenido, o limitamos o suspendemos tu cuenta, te diremos qué
        hicimos, por qué, en qué regla o ley se basa y cómo pedirnos que lo revisemos.
        Puedes pedir esa revisión respondiendo a nuestro mensaje o escribiendo a{' '}
        {LEGAL_EMAIL}, y la hará otra persona de Pocket.
      </p>

      <h2>13. Situación regulatoria, sanciones y prevención de lavado de dinero</h2>
      <p>
        Pocket no compra, vende, intercambia ni convierte activos digitales, no los cambia
        por dinero y no ofrece productos de inversión ni de depósito. Pocket no tiene
        licencia ni registro como institución financiera, institución de pago ni proveedor
        de servicios de activos virtuales en ningún país. Si la ley de un país exige una
        licencia o registro para alguna parte del Servicio, Pocket puede limitar o detener
        el Servicio ahí.
      </p>
      <p>
        Confirmas que no eres, ni te pertenece o controla, una persona incluida en listas
        de sanciones, o ubicada en un país sancionado, por las Naciones Unidas, Estados
        Unidos, la Unión Europea o tu país de residencia. Pocket puede revisar usuarios y
        direcciones de wallet, pedir información adicional, rechazar o suspender cuentas,
        negarse a firmar liberaciones o resoluciones cuando la ley lo exija, e informar a
        las autoridades competentes.
      </p>

      <h2>14. Cerrar tu cuenta y suspensiones</h2>
      <p>
        Puedes cerrar tu cuenta cuando quieras, desde tu{' '}
        <Link href="/account">página de cuenta</Link> o escribiendo a {LEGAL_EMAIL}. Ahí
        también puedes descargar una copia de tus datos antes de cerrarla. No puedes
        cerrarla mientras haya dinero tuyo guardado en un contrato: primero termina o
        resuelve esos Contratos. Las ofertas que el experto todavía no responde se
        retiran, los trabajos abiertos se cierran y las postulaciones pendientes se
        retiran. Lo que pasa con tus datos lo explica la Política de Privacidad.
      </p>
      <p>
        Podemos suspender o cerrar una cuenta, quitar contenido o negar el servicio si
        violas estos Términos, si la ley lo exige, o para proteger a los usuarios, a
        terceros o a Pocket. Cuando podamos, te diremos por qué y te daremos la
        oportunidad de responder. Suspender una cuenta no mueve el dinero que ya está en
        un contrato: se queda ahí, y se libera o se resuelve según las secciones 6 y 7.
        Podemos cerrar cuentas sin actividad durante 24 meses, con 30 días de aviso, pero
        nunca mientras quede dinero en un contrato.
      </p>

      <h2>15. El Servicio se ofrece tal cual</h2>
      <p>
        En la medida en que la ley lo permita, el Servicio se ofrece &quot;tal cual&quot;
        y &quot;según disponibilidad&quot;, sin garantías de ningún tipo, expresas o
        implícitas, incluidas la idoneidad para un fin determinado, la disponibilidad o
        que esté libre de errores. Podemos cambiar, suspender o dejar de ofrecer cualquier
        parte del Servicio, y avisaremos con tiempo razonable cuando un cambio afecte a
        Contratos con dinero depositado.
      </p>

      <h2>16. Límite de responsabilidad</h2>
      <p>
        Nada en esta sección limita la responsabilidad por fraude, dolo o negligencia
        grave, muerte o lesiones personales, incumplimiento de la ley de protección de
        datos, errores propios de Pocket al firmar una liberación o una resolución de
        disputa, ni cualquier responsabilidad que la ley aplicable no permita limitar.
      </p>
      <ul>
        <li>
          <strong>Si usas Pocket para un negocio o una profesión</strong>, incluso como
          startup o como experto independiente, y en la medida en que la ley lo permita:
          Pocket no responde por daños indirectos, incidentales, especiales, consecuentes
          o punitivos, ni por lucro cesante, pérdida de ingresos o de datos; y la
          responsabilidad total de Pocket por todos los reclamos relacionados con el
          Servicio se limita a lo que sea mayor entre las comisiones que le pagaste a
          Pocket en los 12 meses anteriores al reclamo, o 500 dólares estadounidenses.
        </li>
        <li>
          <strong>Si eres consumidor</strong> según la ley de tu país de residencia,
          Pocket responde conforme a esa ley, y los límites anteriores se aplican solo en
          la medida en que esa ley lo permita.
        </li>
        <li>
          Pocket no es responsable de la conducta de otros usuarios, ni del funcionamiento
          de la red de Stellar, Circle, Trustless Work, Pollar o los proveedores de
          wallets, salvo en la medida en que una pérdida la cause un incumplimiento de
          Pocket de estos Términos.
        </li>
      </ul>

      <h2>17. Indemnización</h2>
      <p>
        Si usas Pocket para un negocio o una profesión, indemnizarás a Pocket por los
        reclamos de terceros, y por los costos razonables de defenderse de ellos, en la
        medida en que resulten de tu contenido, de tu incumplimiento de estos Términos o
        de la ley. No tendrás que indemnizar a Pocket por pérdidas causadas por su propio
        incumplimiento, negligencia o mala conducta. Pocket te avisará pronto de cualquier
        reclamo así y te dejará participar en su defensa. Esta sección no se aplica a los
        consumidores, salvo en lo que permita su ley local.
      </p>

      <h2>18. Cambios a estos Términos</h2>
      <p>
        Podemos actualizar estos Términos para reflejar cambios en el Servicio, en la ley
        o en cómo operamos. La versión vigente aparece arriba, con su fecha. Avisaremos
        con al menos 15 días de anticipación, en el Servicio y por correo cuando tengamos
        el tuyo, antes de que una nueva versión entre en vigor, salvo que el cambio lo
        exija la ley o sea urgente por seguridad. Cada nueva versión debe aceptarse para
        seguir usando el Servicio; si no la aceptas, puedes cerrar tu cuenta sin costo.
        Los Contratos con dinero depositado siguen con la versión vigente cuando se
        depositó, salvo que la ley exija otra cosa.
      </p>

      <h2>19. Ley aplicable y reclamos contra Pocket</h2>
      <p>
        Si tienes un problema con Pocket, escríbenos primero a {LEGAL_EMAIL}. La mayoría
        de los problemas se resuelven así, y te responderemos en un máximo de 15 días
        hábiles, o antes si tu ley lo exige.
      </p>
      <p>
        Estos Términos se rigen por las leyes del país donde se constituya la entidad que
        opere Pocket, que indicaremos aquí cuando exista. Esto no te quita la protección
        de las leyes obligatorias de protección al consumidor y de datos del país donde
        vives. Si eres consumidor, puedes presentar acciones ante los tribunales de tu
        lugar de residencia y quejas ante tu autoridad de protección al consumidor, y nada
        en estos Términos te obliga a ir a arbitraje ni a renunciar a acciones colectivas.
      </p>

      <h2>20. Usuarios en la Unión Europea, el Reino Unido y otros lugares</h2>
      <ul>
        <li>
          Si vives en la Unión Europea o en el Reino Unido, tienes los derechos que te dan
          las leyes de protección al consumidor y de datos de tu país, y estos Términos no
          los limitan.
        </li>
        <li>
          Las startups usan Pocket como empresas. Los expertos son profesionales
          independientes, y Pocket les pide actuar como tales. Las normas de protección al
          consumidor que se aplican entre una empresa y un consumidor pueden no aplicarse
          a un Contrato entre dos empresas o profesionales.
        </li>
        <li>
          Nuestro punto único de contacto para usuarios y autoridades, incluso según la
          Ley de Servicios Digitales de la Unión Europea, es {LEGAL_EMAIL}, en español o
          en inglés.
        </li>
        <li>
          Si usas Pocket para un negocio, puedes pedirnos que revisemos cualquier decisión
          de limitar, suspender o cerrar tu cuenta, como describe la sección 12, y te
          avisaremos con al menos 15 días de anticipación de los cambios a estos Términos,
          como describe la sección 18.
        </li>
      </ul>

      <h2>21. Disposiciones generales</h2>
      <ul>
        <li>
          <strong>Contratación y avisos electrónicos.</strong> Aceptas celebrar estos
          Términos de forma electrónica, y recibir avisos en el Servicio y por correo en
          la dirección de contacto que nos diste. Esto cumple cualquier requisito de que
          consten por escrito. Los avisos a Pocket deben enviarse a {LEGAL_EMAIL}.
        </li>
        <li>
          <strong>Fuerza mayor.</strong> Pocket no responde por retrasos o fallas causados
          por hechos fuera de su control razonable, como caídas de la red, congestión o
          paros de la blockchain, actos de un emisor de moneda estable o actos de
          autoridad.
        </li>
        <li>
          <strong>Vigencia.</strong> Las secciones sobre contratos de garantía, disputas,
          licencias de contenido, resultado del trabajo, responsabilidad, indemnización,
          ley aplicable y esta sección siguen vigentes después de cerrar tu cuenta.
        </li>
        <li>
          <strong>Sin terceros beneficiarios.</strong> Estos Términos no crean derechos
          para nadie más que tú y Pocket.
        </li>
        <li>
          <strong>Sugerencias.</strong> Si nos envías sugerencias, podemos usarlas
          libremente y sin ninguna obligación contigo.
        </li>
        <li>
          <strong>Marcas.</strong> El nombre y el logo de Pocket pertenecen a Pocket; no
          puedes usarlos sin nuestro permiso.
        </li>
        <li>
          <strong>Autoridades.</strong> Pocket puede entregar información a las
          autoridades cuando la ley lo exija, y avisará a los usuarios afectados cuando la
          ley lo permita.
        </li>
        <li>
          <strong>Acuerdo completo.</strong> Estos Términos, la Política de Privacidad y
          los términos que se muestren para una función específica son todo el acuerdo
          entre tú y Pocket sobre el Servicio. Si una disposición resulta inválida, el
          resto sigue vigente. No exigir una disposición no es renunciar a ella.
        </li>
        <li>
          <strong>Cesión.</strong> No puedes ceder tus derechos de estos Términos sin
          nuestro consentimiento. Podemos ceder los nuestros a la entidad que opere
          Pocket, o como parte de una fusión o venta, y te avisaremos si lo hacemos.
        </li>
        <li>
          <strong>Idioma.</strong> Estos Términos están en español y en{' '}
          <Link href="/terms/en">inglés</Link>. Si las dos versiones difieren, prevalece
          la versión en español, salvo que la ley de tu país exija otra cosa.
        </li>
      </ul>

      <h2>22. Contacto</h2>
      <p>Para cualquier tema sobre estos Términos, escribe a {LEGAL_EMAIL}.</p>
    </LegalPage>
  );
}
