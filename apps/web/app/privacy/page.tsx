import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, PRIVACY_EMAIL } from '@/components/legal-page';

export const metadata: Metadata = { title: 'Política de Privacidad' };

export default function PrivacyPage() {
  return (
    <LegalPage
      lang="es"
      title="Política de Privacidad"
      otherLanguage="/privacy/en"
      summary={
        <>
          <p className="font-semibold">En resumen</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              Usamos tus datos para operar tu cuenta, publicar tu perfil y manejar los
              contratos, las disputas y los reportes de resultados. Nada más.
            </li>
            <li>
              No vendemos tus datos, no mostramos anuncios y no te seguimos en otros
              sitios.
            </li>
            <li>
              Tu dirección de wallet y los pagos de tus contratos están en una blockchain
              pública, donde nadie puede borrarlos.
            </li>
            <li>
              Puedes descargar tus datos y eliminar tu cuenta desde tu{' '}
              <Link href="/account">página de cuenta</Link>. Para todo lo demás, una
              persona atiende tu solicitud en {PRIVACY_EMAIL}.
            </li>
          </ul>
        </>
      }
    >
      <h2>1. Quién es responsable de tus datos</h2>
      <p>
        Pocket (&quot;Pocket&quot;, &quot;nosotros&quot;) es responsable de los datos
        personales que se describen aquí. Pocket lo opera su equipo fundador mientras se
        constituye una entidad legal. Hasta entonces, sus fundadores son los responsables
        de tus datos. Cuando exista la entidad, ella será la responsable, y publicaremos
        aquí su nombre legal, su domicilio registrado y el contacto de su encargado de
        protección de datos. Puedes escribirnos sobre privacidad a {PRIVACY_EMAIL}.
      </p>
      <p>
        Esta Política se aplica a todas las personas que usan Pocket, en cualquier país.
        Si la ley de tu país te da más derechos que esta Política, los tienes.
      </p>

      <h2>2. Qué datos recopilamos</h2>
      <h3>Lo que nos das</h3>
      <ul>
        <li>
          <strong>Cuenta:</strong> tu dirección de wallet de Stellar y tu rol, startup o
          experto. Si entras con Pollar, también tu correo y cómo entraste, por ejemplo
          con Google, y tu identificador de usuario de Pollar.
        </li>
        <li>
          <strong>Datos de tu cuenta:</strong> tu nombre completo, tu correo de contacto y
          tu país, y de forma opcional tu LinkedIn, tu sitio web y una nota. Las startups
          también dan el nombre de su empresa y, de forma opcional, su número de registro.
        </li>
        <li>
          <strong>Perfil de experto:</strong> nombre, titular, biografía, categorías,
          habilidades, herramientas, años de experiencia, idiomas, zona horaria,
          disponibilidad semanal, tarifa por hora, proyecto mínimo, ubicación, trabajos
          anteriores con sus enlaces y resultados, y enlaces a tu portafolio, LinkedIn y
          CV, o el CV que subas en PDF.
        </li>
        <li>
          <strong>Perfil de startup:</strong> nombre de la empresa, razón social,
          descripción en una línea, descripción, sector, etapa, qué busca, sitio web,
          logo, idiomas, ubicación y el cargo de su persona de contacto.
        </li>
        <li>
          <strong>Actividad en el marketplace:</strong> los trabajos que publicas con los
          KPIs con que se miden, tus postulaciones, ofertas, contratos, hitos, entregas
          con sus enlaces, archivos y resultados reportados, comentarios de cambios,
          disputas, pruebas y comentarios.
        </li>
      </ul>
      <h3>Lo que recopilamos de forma automática</h3>
      <ul>
        <li>
          <strong>Datos de seguridad:</strong> cuando se rechaza una solicitud (sin
          sesión, sin permiso o demasiadas solicitudes) y en eventos de seguridad como
          inicios y cierres de sesión, eliminación de cuentas y descargas de datos,
          registramos tu dirección IP, el método y la ruta de la solicitud, tu
          identificador de usuario y la hora. Para limitar abusos contamos las solicitudes
          por dirección IP o por cuenta, en memoria, durante cerca de un minuto.
        </li>
        <li>
          <strong>Reportes de errores:</strong> cuando algo falla, enviamos a Sentry
          detalles técnicos de la falla, como la página o la solicitud, tu identificador
          de usuario, tu dirección IP y tu navegador, para poder corregirla.
        </li>
        <li>
          <strong>Registros de consentimiento:</strong> qué versión de nuestros Términos y
          de esta Política aceptaste, cuándo y desde qué dirección IP.
        </li>
        <li>
          <strong>Registros que generamos:</strong> el historial de las transacciones en
          blockchain hechas a través de Pocket para tu cuenta, a quién pagó cada pago
          según lo registró la blockchain, y el reporte de resultados de cada contrato,
          armado con sus entregas y sus pagos.
        </li>
        <li>
          <strong>En tu dispositivo:</strong> tu token de sesión y, si usas una wallet de
          navegador, su dirección y su nombre, guardados en el almacenamiento local de tu
          navegador. Son estrictamente necesarios para que el Servicio funcione. No usamos
          cookies de publicidad, ni seguimiento, ni analítica. Pollar y las extensiones de
          wallet pueden guardar sus propios datos según sus propias políticas.
        </li>
      </ul>
      <p>
        No pedimos datos sensibles, como salud, origen étnico, religión, opiniones
        políticas, afiliación sindical o vida sexual, y te pedimos no incluirlos en
        ninguna parte de Pocket (ver la sección 4).
      </p>

      <h2>3. Para qué los usamos y con qué base</h2>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-navy">
              <th className="py-2 pr-4 font-semibold">Datos</th>
              <th className="py-2 pr-4 font-semibold">Para qué</th>
              <th className="py-2 font-semibold">Base legal</th>
            </tr>
          </thead>
          <tbody className="align-top [&_td]:py-2 [&_td]:pr-4 [&_tr]:border-b [&_tr]:border-border">
            <tr>
              <td>Dirección de wallet, rol, correo y proveedor de Pollar</td>
              <td>Crear y proteger tu cuenta, e iniciar tu sesión</td>
              <td>Nuestro contrato contigo</td>
            </tr>
            <tr>
              <td>Datos de tu cuenta</td>
              <td>
                Activar tu cuenta, mostrar a la otra parte de un contrato quién eres y
                prevenir fraudes, incluido rechazar una contratación entre dos cuentas con
                el mismo correo de contacto
              </td>
              <td>
                Nuestro contrato; nuestro interés legítimo en un marketplace confiable;
                obligaciones legales
              </td>
            </tr>
            <tr>
              <td>Perfil, incluido el CV</td>
              <td>Publicar tu perfil para que otros te encuentren y te contraten</td>
              <td>Nuestro contrato; tu consentimiento para publicar tu perfil y tu CV</td>
            </tr>
            <tr>
              <td>
                Actividad en el marketplace, resultados, correo de contacto compartido con
                la otra parte
              </td>
              <td>Operar contratos, pagos, disputas y reportes de resultados</td>
              <td>Nuestro contrato</td>
            </tr>
            <tr>
              <td>Datos de seguridad y reportes de errores</td>
              <td>
                Proteger cuentas, prevenir abusos, investigar incidentes y corregir fallas
              </td>
              <td>Interés legítimo; obligaciones legales</td>
            </tr>
            <tr>
              <td>Registros de consentimiento</td>
              <td>Demostrar qué aceptaste y cuándo</td>
              <td>Obligación legal; defensa ante reclamos legales</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        No usamos tus datos para marketing, publicidad ni perfilamiento, y no los
        vendemos. Los campos opcionales puedes dejarlos vacíos sin ningún costo. Sin los
        datos obligatorios no podemos crear ni activar tu cuenta, ni dejarte contratar o
        ser contratado.
      </p>
      <h3>Consentimiento, y cómo retirarlo</h3>
      <p>
        Al crear tu cuenta te pedimos, aparte de los Términos, tu consentimiento para
        tratar tus datos como describe esta Política, incluido publicar tu perfil y tu CV
        cuando tu cuenta esté activa, y transferir tus datos al extranjero (sección 6).
        Puedes retirarlo cuando quieras borrando tu CV o tu perfil, eliminando tu cuenta
        desde tu <Link href="/account">página de cuenta</Link>, o escribiendo a{' '}
        {PRIVACY_EMAIL}. Retirarlo no afecta lo que se hizo antes. Si el consentimiento
        era necesario para una función, tendremos que dejar de ofrecerte esa función.
      </p>
      <h3>Decisiones automatizadas</h3>
      <p>
        Tu cuenta se activa de forma automática cuando completas sus datos. Las decisiones
        que valoran lo que pasó, como resolver una disputa, las toman personas. Dos
        decisiones en tu contra se toman de forma automática: rechazamos una contratación
        entre dos cuentas con el mismo correo de contacto, para evitar que alguien se
        contrate a sí mismo; y bloqueamos por un rato las solicitudes que superan nuestros
        límites. Si crees que alguna te afectó por error, escribe a {PRIVACY_EMAIL} y una
        persona la revisará.
      </p>

      <h2>4. Perfiles públicos y datos sensibles</h2>
      <p>
        Cuando tu cuenta está activa, tu perfil, incluido el CV que subas, es público:
        cualquiera puede verlo, y descargar el CV, sin tener cuenta. Pedimos a los
        buscadores que no indexen los perfiles ni los CV de los expertos, pero las copias
        que hagan otros quedan fuera de nuestro control. Los perfiles muestran una
        dirección de wallet abreviada, no la completa.
      </p>
      <p>
        <strong>No incluyas datos sensibles en tu perfil ni en tu CV</strong>: fotos,
        fecha de nacimiento, números de documentos de identidad, domicilio, salud, origen
        étnico, religión, opiniones políticas, afiliación sindical, vida sexual o datos
        financieros. Si los encontramos, podemos pedirte que los quites o quitarlos
        nosotros. Puedes cambiar o borrar tu CV cuando quieras.
      </p>

      <h2>5. Quién puede ver tus datos</h2>
      <ul>
        <li>
          <strong>Cualquier persona:</strong> los perfiles públicos de las cuentas
          activas, los CV que suben y los trabajos que publican las startups, con los KPIs
          con que se miden.
        </li>
        <li>
          <strong>La otra parte de un contrato:</strong> tu postulación, tus entregas, sus
          resultados y tus comentarios, el reporte de resultados del contrato y, cuando el
          experto acepta los términos, tu correo de contacto.
        </li>
        <li>
          <strong>Los managers de Pocket</strong>, solo cuando lo necesitan: los datos de
          tu cuenta, los reportes de resultados y todo lo de una disputa.
        </li>
        <li>
          <strong>Proveedores</strong> que tratan datos siguiendo nuestras instrucciones:
          Supabase (base de datos, Estados Unidos), Railway (servidor de la API y sus
          registros), Vercel (servidor del sitio web), Sentry (reportes de errores,
          Estados Unidos), Resend (envía las notificaciones a tu correo de contacto,
          Estados Unidos) y Trustless Work (arma las transacciones de los contratos, con
          direcciones de wallet, montos e hitos). Nuestras alertas privadas de seguridad,
          que llegan a un canal de Discord, solo tienen datos técnicos de la cuenta de
          Pocket, nunca tu nombre, tu correo ni tu wallet.
        </li>
        <li>
          <strong>Terceros independientes</strong> con sus propias políticas de
          privacidad: Pollar, que crea y guarda las wallets de quienes entran con correo o
          Google y conoce tu correo; Google, si entras con Google; la red de Stellar, que
          es pública; y Circle, que emite el USDC.
        </li>
        <li>
          <strong>Autoridades</strong>, cuando la ley lo exija, o para proteger los
          derechos y la seguridad de los usuarios o de Pocket.
        </li>
      </ul>

      <h2>6. Transferencias internacionales</h2>
      <p>
        Tus datos se guardan en Estados Unidos (Supabase, us-west-2) y los tratan los
        proveedores de la lista anterior, en Estados Unidos y en otros lugares. Los
        transferimos porque es necesario para cumplir nuestro contrato contigo y con tu
        consentimiento, y acordaremos con nuestros proveedores las garantías que exija la
        ley de tu país, como las cláusulas contractuales tipo. Puedes pedirnos una copia
        de esas garantías en {PRIVACY_EMAIL}. Los datos de la blockchain los replica en
        todo el mundo la red de Stellar, y esa no es una transferencia que controlemos
        (sección 7).
      </p>

      <h2>7. Qué hay en la blockchain</h2>
      <p>
        Tu dirección de wallet es un dato personal, porque Pocket la vincula a tu cuenta.
        Cada contrato de garantía es un contrato inteligente público en Stellar que guarda
        las direcciones de wallet completas de la startup y del experto, los montos de los
        hitos, el estado del contrato y un identificador del contrato. Cada depósito,
        aprobación, liberación y resolución de disputa es una transacción pública.
        Cualquiera puede leer estos datos, y quien conozca tu dirección, o la vea junto a
        tu nombre, puede vincular esos pagos contigo.
      </p>
      <p>
        La red de Stellar, no Pocket, guarda este registro, y nadie puede cambiarlo ni
        borrarlo, ni siquiera nosotros. Cuando eliminas tu cuenta, borramos lo que
        guardamos fuera de la blockchain y el vínculo entre tu identidad y tu dirección,
        pero el registro en la blockchain se queda. Para limitarlo, puedes usar una wallet
        que no uses para nada más. Pollar y Circle también pueden ver tu actividad en la
        blockchain, y Circle puede congelar el USDC de una dirección según sus propios
        términos.
      </p>

      <h2>8. Cuánto tiempo los guardamos</h2>
      <ul>
        <li>
          <strong>Perfil y CV:</strong> hasta que los cambies o los borres, o elimines tu
          cuenta.
        </li>
        <li>
          <strong>Datos de tu cuenta:</strong> hasta que elimines tu cuenta.
        </li>
        <li>
          <strong>
            Contratos, entregas y sus resultados, pagos, disputas, pruebas y registros de
            consentimiento:
          </strong>{' '}
          mientras tu cuenta esté abierta y después durante los plazos que exijan las
          leyes comerciales, fiscales y de prescripción, hasta 10 años después de que
          termine el contrato. Cuando eliminas tu cuenta se quedan ligados a una cuenta
          anónima, porque también son registros de la otra parte.
        </li>
        <li>
          <strong>Registros de seguridad:</strong> hasta 30 días, en nuestro proveedor de
          hosting.
        </li>
        <li>
          <strong>Reportes de errores:</strong> hasta 90 días, en Sentry.
        </li>
        <li>
          <strong>Retos de inicio de sesión:</strong> minutos. Se borran al usarse o al
          vencer.
        </li>
      </ul>
      <p>
        Cuando termina un plazo, borramos o anonimizamos los datos. Los registros de la
        blockchain son permanentes (sección 7).
      </p>

      <h2>9. Tus derechos</h2>
      <p>
        Según dónde vivas, puedes: acceder a tus datos y obtener una copia; corregirlos;
        borrarlos; oponerte a un uso o pedirnos que lo limitemos; recibirlos en un formato
        portable; retirar un consentimiento que diste; preguntar con qué proveedores los
        compartimos; y pedir que una persona revise una decisión automatizada. En México
        estos son tus derechos ARCO.
      </p>
      <ul>
        <li>
          <strong>Tú mismo, cuando quieras:</strong> descarga todos tus datos, y elimina
          tu cuenta, desde tu <Link href="/account">página de cuenta</Link>. Corrige tu
          perfil desde tu <Link href="/profile">página de perfil</Link>.
        </li>
        <li>
          <strong>Para todo lo demás:</strong> escribe a {PRIVACY_EMAIL} desde el correo
          vinculado a tu cuenta, o demuestra que controlas tu wallet firmando un mensaje
          que te enviemos. Dinos tu dirección de wallet, el derecho que quieres ejercer y,
          para una corrección, el dato correcto. Podemos pedirte una prueba de identidad,
          y quien actúe por ti debe demostrar que puede hacerlo.
        </li>
      </ul>
      <p>
        Ejercer tus derechos es gratis. Respondemos en el plazo más corto que fije tu ley,
        y nunca después de 15 días hábiles. Si debemos conservar algún dato, te diremos
        cuál y por qué. Nadie puede borrar los datos de la blockchain.
      </p>

      <h2>10. Cómo los protegemos</h2>
      <p>
        Los datos viajan cifrados, entre tu navegador y Pocket y entre Pocket y su base de
        datos, y nuestro proveedor de base de datos los guarda cifrados. Solo la API de
        Pocket y un número reducido de administradores autorizados pueden acceder a la
        base de datos. Las sesiones duran hasta 12 horas y se pueden revocar. Los tokens
        de sesión se guardan en el almacenamiento local de tu navegador, que los protege
        menos que una cookie segura. Ningún sistema es perfectamente seguro. Si una
        filtración crea un riesgo relevante para ti, te avisaremos a ti y a las
        autoridades competentes en el plazo que exija la ley, explicando qué pasó, qué
        datos se vieron afectados y qué puedes hacer.
      </p>

      <h2>11. Menores de edad</h2>
      <p>
        Pocket es solo para personas de 18 años o más, y no recopilamos a sabiendas datos
        de menores. Si crees que un menor nos dio sus datos, escribe a {PRIVACY_EMAIL} y
        los borraremos.
      </p>

      <h2>12. Quejas</h2>
      <p>
        Escríbenos primero, para intentar resolverlo. También puedes presentar una queja
        ante la autoridad de protección de datos de tu país, por ejemplo: en Brasil, la
        ANPD; en México, la autoridad designada por su ley federal de protección de datos;
        en Colombia, la Superintendencia de Industria y Comercio; en Argentina, la Agencia
        de Acceso a la Información Pública; en Chile, la Agencia de Protección de Datos
        Personales cuando esté en funcionamiento, y los tribunales mientras tanto; en
        Perú, la Autoridad Nacional de Protección de Datos Personales; en Costa Rica, la
        PRODHAB; en Ecuador, la Superintendencia de Protección de Datos Personales; en
        Uruguay, la URCDP; y en Bolivia, los tribunales, mediante la acción de protección
        de privacidad.
      </p>

      <h2>13. Usuarios en la Unión Europea, el Reino Unido y otros lugares</h2>
      <p>
        Si estás en la Unión Europea, el Espacio Económico Europeo o el Reino Unido, a tus
        datos se les aplica el Reglamento General de Protección de Datos, o su versión del
        Reino Unido. En particular:
      </p>
      <ul>
        <li>
          Las bases legales de la sección 3 son las del Reglamento: ejecución de un
          contrato, intereses legítimos, obligaciones legales y consentimiento.
        </li>
        <li>
          Puedes oponerte en cualquier momento a cualquier uso de tus datos basado en
          nuestros intereses legítimos, y dejaremos de hacerlo salvo que tengamos motivos
          legítimos imperiosos, o lo necesitemos para formular o defender reclamos
          legales.
        </li>
        <li>
          Las transferencias de tus datos fuera del Espacio Económico Europeo o del Reino
          Unido se hacen con las cláusulas contractuales tipo de la Comisión Europea, o su
          equivalente del Reino Unido, con nuestros proveedores.
        </li>
        <li>
          Ninguna de las decisiones automatizadas de la sección 3 produce efectos legales
          sobre ti ni te afecta de forma similarmente significativa; aun así puedes pedir
          que una persona las revise.
        </li>
        <li>
          Si ofrecemos Pocket a personas en la Unión Europea o el Reino Unido, nombraremos
          un representante ahí, como exige el Reglamento, y publicaremos sus datos aquí.
        </li>
        <li>
          Puedes presentar una queja ante la autoridad de protección de datos del país
          donde vives o trabajas, o donde creas que se infringieron tus derechos; en el
          Reino Unido, la Information Commissioner&apos;s Office.
        </li>
      </ul>
      <p>
        Si vives en Estados Unidos, no vendemos tu información personal ni la compartimos
        para publicidad conductual entre contextos, y puedes ejercer los derechos que te
        da tu estado de la misma forma que los de la sección 9. Vivas donde vivas,
        tratamos tus datos como describe esta Política, y puedes ejercer los derechos de
        la sección 9.
      </p>

      <h2>14. Cambios a esta Política</h2>
      <p>
        Podemos actualizar esta Política. La versión vigente aparece arriba, con su fecha.
        Avisaremos con al menos 15 días de anticipación de los cambios importantes, en el
        Servicio y por correo cuando tengamos el tuyo, y te pediremos aceptarlos antes de
        seguir usando Pocket. Esta Política está en español y en{' '}
        <Link href="/privacy/en">inglés</Link>; si las dos versiones difieren, prevalece
        la versión en español, salvo que la ley de tu país exija otra cosa.
      </p>

      <h2>15. Contacto</h2>
      <p>Para cualquier tema sobre tus datos, escribe a {PRIVACY_EMAIL}.</p>
    </LegalPage>
  );
}
