import { useState, createContext, useContext, useMemo, useEffect, useCallback } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import {
  Library, User, LogOut, Bell, Search, Plus, Pencil, Trash2,
  CheckCircle, X, BookMarked, Users, LayoutDashboard, ChevronRight,
  BookOpen, CalendarClock, AlertCircle, Filter, Package,
  ClipboardList, RefreshCw, RotateCcw, TrendingUp, AlertTriangle,
  BarChart3, Send, MessageSquare, BookCopy, UserCog,
  Sliders, Eye, ShieldAlert, ChevronDown, Menu
} from "lucide-react";

function useIsMobile(bp = 768) {
  const [m, setM] = useState(() => window.innerWidth < bp);
  useEffect(() => {
    const h = () => setM(window.innerWidth < bp);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, [bp]);
  return m;
}

type Book = {
  id: number;
  isbn?: string;
  titulo: string;
  autor: string;
  categoria: string;
  estado: string;
  stock: number;
  prestamos?: number;
  ubicacion?: string;
  resumen?: string;
  portada?: string;
};

type UserRecord = {
  id: number;
  nombre: string;
  usuario: string;
  password?: string;
  rol: string;
  estado: string;
  isSeed?: boolean;
};

type Session = {
  nombre: string;
  rol: string;
  userId: string;
} | null;

type Prestamo = {
  id: number;
  bookId: number;
  userId: string;
  fechaInicio: string;
  fechaDevolucion: string;
  renovado: boolean;
  renewalStatus: string | null;
  activo: boolean;
};

type Params = {
  diasPrestamo: number;
  limiteLibros: number;
  multaPorDia: number;
};

type AuditEntry = {
  id: number;
  usuario: string;
  fecha: string;
  accion: string;
  detalle: string;
};

type Toast = {
  id: number;
  msg: string;
  type: string;
};

type UserNotif = {
  id: number;
  targetUserId: string;
  mensaje: string;
  bookTitle?: string;
  fecha: string;
  leida: boolean;
};

type SysNotif = {
  id: string;
  prestamoId: number;
  userId: string;
  userName: string;
  bookTitle: string;
  type: string;
  msg: string;
};

type AppContextValue = {
  session: Session;
  effectiveRole: string;
  viewAs: string | null;
  setViewAs: Dispatch<SetStateAction<string | null>>;
  login: (u: Session) => void;
  logout: () => void;
  books: Book[];
  addBook: (b: Partial<Book>) => void;
  updateBook: (b: Book) => void;
  deleteBook: (id: number) => void;
  updateStock: (id: number, delta: number) => void;
  users: UserRecord[];
  addUser: (u: Partial<UserRecord>) => void;
  updateUser: (u: UserRecord) => void;
  deleteUser: (id: number) => void;
  toggleUser: (id: number) => void;
  selfRegister: (u: { nombre: string; usuario: string; password: string }) => string | null;
  prestamos: Prestamo[];
  misActivos: (userId: string) => Prestamo[];
  registrarPrestamo: (bookId: number, userId: string) => boolean;
  registrarDevolucion: (prestamoId: number) => void;
  solicitarRenovacion: (prestamoId: number, userId: string) => void;
  aprobarRenovacion: (prestamoId: number) => void;
  rechazarRenovacion: (prestamoId: number) => void;
  params: Params;
  updateParams: (p: Params) => void;
  auditLog: AuditEntry[];
  sysNotifs: SysNotif[];
  userNotifs: UserNotif[];
  enviarNotificacion: (targetUserId: string, targetUserName: string, mensaje: string, bookTitle?: string) => void;
  misNotificaciones: (userId: string) => UserNotif[];
  marcarLeida: (id: number) => void;
  toasts: Toast[];
  addToast: (msg: string, type?: string) => void;
};

// ─── HELPERS ────────────────────────────────────────────────
const CATEGORIAS = ["Todas","Ingeniería de Software","Arquitectura","Programación","Ciencia de Datos","Inteligencia Artificial","Redes","Base de Datos"];
const ESTADOS_FILTER = ["Todos","disponible","prestado","reservado"];
const ROLES = ["Admin","Bibliotecario","Usuario"];
const ROLE_LEVEL: Record<string, number> = { Usuario:1, Bibliotecario:2, Admin:3 };
const hasLevel = (viewed, min) => (ROLE_LEVEL[viewed]||0) >= (ROLE_LEVEL[min]||0);

const fmtDate = d => d.toLocaleDateString("es-CL",{day:"2-digit",month:"2-digit",year:"numeric"});
const addDays  = (n, base = null) => { const d = base ? new Date(base) : new Date(); d.setDate(d.getDate()+n); return fmtDate(d); };
const parseCL  = s => { if(!s) return new Date(0); const [d,m,y]=s.split("/"); return new Date(`${y}-${m}-${d}`); };
const isOver   = s => parseCL(s) < new Date();
const daysLeft = s => Math.ceil((parseCL(s).getTime()-Date.now())/86400000);

const PWD_RULES = [
  { test: v => v.length >= 8,   msg: "Mínimo 8 caracteres" },
  { test: v => /[A-Z]/.test(v), msg: "Al menos una letra mayúscula" },
  { test: v => /[0-9]/.test(v), msg: "Al menos un número" },
];
const validatePassword = pwd => PWD_RULES.filter(r => !r.test(pwd)).map(r => r.msg);

// ─── SEED DATA ──────────────────────────────────────────────
const SEED_ADMIN = { id:0, nombre:"Administrador", usuario:"admin", password:"admin123", rol:"Admin", estado:"activo", isSeed:true };
const ensureSeedAdmin = list => list.some(u=>u.isSeed) ? list : [SEED_ADMIN, ...list];

const INITIAL_BOOKS = [
  {id:1,isbn:"978-0-13-468599-1",titulo:"Clean Code",                   autor:"Robert C. Martin",categoria:"Ingeniería de Software", estado:"disponible",stock:5,prestamos:12,ubicacion:"Estante A-1",resumen:"Guía esencial para escribir código limpio, legible y mantenible con buenas prácticas de ingeniería.",portada:"https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=600&q=90"},
  {id:2,isbn:"978-0-201-63361-0",titulo:"Design Patterns",              autor:"Gang of Four",     categoria:"Arquitectura",           estado:"disponible",stock:3,prestamos:9, ubicacion:"Estante B-2",resumen:"Catálogo de 23 patrones de diseño orientado a objetos para resolver problemas recurrentes de software.",portada:"https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600&q=90"},
  {id:3,isbn:"978-0-596-51774-8",titulo:"JavaScript: The Good Parts",   autor:"D. Crockford",    categoria:"Programación",           estado:"disponible",stock:4,prestamos:15,ubicacion:"Estante C-1",resumen:"Explora las partes más poderosas y elegantes de JavaScript, separando lo útil de lo problemático.",portada:"https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=600&q=90"},
  {id:4,isbn:"978-1-491-91205-8",titulo:"Python for Data Analysis",     autor:"Wes McKinney",    categoria:"Ciencia de Datos",       estado:"disponible",stock:2,prestamos:7, ubicacion:"Estante C-3",resumen:"Introducción práctica al análisis de datos con Python usando pandas, NumPy y Jupyter.",portada:"https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=600&q=90"},
  {id:5,isbn:"978-1-617-29492-2",titulo:"Deep Learning with Python",    autor:"F. Chollet",      categoria:"Inteligencia Artificial",estado:"disponible",stock:6,prestamos:18,ubicacion:"Estante D-1",resumen:"Introduce el aprendizaje profundo con Keras, escrito por el creador de la librería.",portada:"https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=600&q=90"},
  {id:6,isbn:"978-0-13-235088-4",titulo:"The Pragmatic Programmer",     autor:"Hunt & Thomas",   categoria:"Ingeniería de Software", estado:"disponible",stock:3,prestamos:11,ubicacion:"Estante A-2",resumen:"Consejos y filosofía para desarrolladores que quieren mejorar su oficio y productividad.",portada:"https://images.unsplash.com/photo-1461749280684-dccba630e2f6?w=600&q=90"},
  {id:7,isbn:"978-1-491-95020-3",titulo:"Fluent Python",                autor:"L. Ramalho",      categoria:"Programación",           estado:"disponible",stock:4,prestamos:8, ubicacion:"Estante C-2",resumen:"Explora las características idiomáticas de Python para escribir código más eficiente y expresivo.",portada:"https://images.unsplash.com/photo-1515879218367-8466d910aaa4?w=600&q=90"},
  {id:8,isbn:"978-1-492-05127-5",titulo:"Designing Data-Intensive Apps",autor:"M. Kleppmann",    categoria:"Base de Datos",          estado:"disponible",stock:2,prestamos:6, ubicacion:"Estante B-3",resumen:"Explora los principios de sistemas distribuidos, bases de datos y arquitecturas escalables.",portada:"https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=600&q=90"},
];

const INITIAL_USERS = ensureSeedAdmin([
  SEED_ADMIN,
  {id:2,nombre:"Carlos Rojas",usuario:"biblio",password:"biblio123",rol:"Bibliotecario",estado:"activo"},
]);

const INITIAL_PRESTAMOS: Prestamo[] = [];
const DEFAULT_PARAMS = { diasPrestamo:7, limiteLibros:3, multaPorDia:1000 };
const EMPTY_BOOK = {titulo:"",autor:"",isbn:"",categoria:"Programación",portada:"",estado:"disponible",stock:1};
const EMPTY_USER = {nombre:"",usuario:"",password:"",rol:"Usuario",estado:"activo"};

// ─── CONTEXT ─────────────────────────────────────────────────
const AppCtx = createContext<AppContextValue | null>(null);
const useApp = () => {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error("useApp debe usarse dentro de AppProvider");
  return ctx;
};

function AppProvider({ children }: { children: ReactNode }) {
  const [session,    setSession]    = useState<Session>(null);
  const [viewAs,     setViewAs]     = useState<string | null>(null);
  const [books,      setBooks]      = useState(INITIAL_BOOKS);
  const [users,      setUsers]      = useState(INITIAL_USERS);
  const [prestamos,  setPrestamos]  = useState<Prestamo[]>(INITIAL_PRESTAMOS);
  const [params,     setParams]     = useState(DEFAULT_PARAMS);
  const [auditLog,   setAuditLog]   = useState<AuditEntry[]>([]);
  const [toasts,     setToasts]     = useState<Toast[]>([]);
  const [userNotifs, setUserNotifs] = useState<UserNotif[]>([]);

  const effectiveRole = session?.rol === "Admin" && viewAs ? viewAs : session?.rol;

  const addToast = useCallback((msg, type="success") => {
    const id = Date.now();
    setToasts(p => [...p, {id, msg, type}]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 4500);
  }, []);

  const log = useCallback((accion, detalle = "", quien = undefined) => {
    setAuditLog(p => [{id:Date.now(), usuario:quien||session?.nombre||"Sistema",
      fecha:new Date().toLocaleString("es-CL"), accion, detalle}, ...p]);
  }, [session]);

  const sysNotifs = useMemo(() => {
    const alerts: {id:string,prestamoId:number,userId:string,userName:string,bookTitle:string,type:string,msg:string}[] = [];
    prestamos.filter(p=>p.activo).forEach(p => {
      const book = books.find(b=>b.id===p.bookId);
      const user = users.find(u=>u.usuario===p.userId);
      if(!book||!user) return;
      const dl = daysLeft(p.fechaDevolucion);
      if(dl<0)    alerts.push({id:`ov-${p.id}`,prestamoId:p.id,userId:p.userId,userName:user.nombre,bookTitle:book.titulo,type:"danger", msg:`Vencido: "${book.titulo}" — ${user.nombre} (${Math.abs(dl)}d)`});
      else if(dl<=2) alerts.push({id:`wa-${p.id}`,prestamoId:p.id,userId:p.userId,userName:user.nombre,bookTitle:book.titulo,type:"warning",msg:`Vence en ${dl}d: "${book.titulo}" — ${user.nombre}`});
    });
    return alerts;
  }, [prestamos, books, users]);

  const login  = u => { setSession(u); setViewAs(null); };
  const logout = () => { setSession(null); setViewAs(null); };

  // Books
  const addBook    = b => { setBooks(p=>[...p,{...b,id:Date.now(),stock:+b.stock||1,prestamos:0}]); log("Registro libro",b.titulo); };
  const updateBook = b => { setBooks(p=>p.map(x=>x.id===b.id?{...b,stock:+b.stock||1}:x)); log("Edición libro",b.titulo); };
  const deleteBook = id => { const t=books.find(x=>x.id===id)?.titulo; setBooks(p=>p.filter(x=>x.id!==id)); log("Eliminación libro",t); };
  const updateStock= (id,delta) => setBooks(p=>p.map(x=>x.id===id?{...x,stock:Math.max(0,x.stock+delta)}:x));

  // Users
  const addUser = u => { setUsers(p=>[...p,{...u,id:Date.now()}]); log("Usuario registrado",u.nombre); };
  const updateUser = u => {
    if(u.isSeed && u.rol!=="Admin"){ addToast("No se puede cambiar el rol del Admin maestro.","error"); return; }
    setUsers(p=>p.map(x=>x.id===u.id?u:x)); log("Usuario editado",u.nombre);
  };
  const deleteUser = id => {
    const u = users.find(x=>x.id===id);
    if(!u||u.isSeed){ addToast("La cuenta maestra no puede eliminarse.","error"); return; }
    setUsers(p=>p.filter(x=>x.id!==id));
    log("Usuario eliminado",u.nombre);
    addToast(`Usuario "${u.nombre}" eliminado permanentemente.`,"success");
  };
  const toggleUser = id => {
    const u = users.find(x=>x.id===id);
    if(u?.isSeed){ addToast("La cuenta maestra no puede desactivarse.","error"); return; }
    setUsers(p=>p.map(x=>x.id===id?{...x,estado:x.estado==="activo"?"suspendido":"activo"}:x));
    log("Toggle estado",u?.nombre);
  };
  const updateParams = p => { setParams(p); log("Parámetros actualizados","Sistema"); };

  // Préstamos
  const misActivos = userId => prestamos.filter(p=>p.activo&&p.userId===userId);

  const registrarPrestamo = (bookId, userId) => {
    const activos = misActivos(userId);
    if(activos.length>=params.limiteLibros){ addToast(`Límite: máximo ${params.limiteLibros} préstamos.`,"error"); return false; }
    const book = books.find(b=>b.id===bookId);
    if(!book||book.stock<=0){ addToast("Sin stock disponible.","error"); return false; }
    const user = users.find(u=>u.usuario===userId);
    setBooks(p=>p.map(x=>x.id===bookId?{...x,stock:Math.max(0,x.stock-1),estado:x.stock-1<=0?"prestado":"disponible",prestamos:(x.prestamos||0)+1}:x));
    const fechaDev = addDays(params.diasPrestamo);
    const np = {id:Date.now(),bookId,userId,fechaInicio:fmtDate(new Date()),fechaDevolucion:fechaDev,renovado:false,renewalStatus:null,activo:true};
    setPrestamos(p=>[...p,np]);
    // Notificación automática al usuario (Fase 13)
    setUserNotifs(p=>[...p,{
      id:Date.now()+1,
      targetUserId:userId,
      mensaje:`📚 Te han prestado "${book?.titulo}". Recuerda devolverlo antes del ${fechaDev}.`,
      bookTitle:book?.titulo,
      fecha:fmtDate(new Date()),
      leida:false,
    }]);
    log("Préstamo registrado",`${book?.titulo} → ${user?.nombre}`);
    addToast(`Préstamo registrado. Devolver: ${fechaDev}`,"success");
    return true;
  };

  const registrarDevolucion = prestamoId => {
    const pr = prestamos.find(p=>p.id===prestamoId); if(!pr) return;
    setBooks(p=>p.map(x=>x.id===pr.bookId?{...x,stock:x.stock+1,estado:"disponible"}:x));
    setPrestamos(p=>p.map(x=>x.id===prestamoId?{...x,activo:false}:x));
    log("Devolución",books.find(b=>b.id===pr.bookId)?.titulo);
  };

  const solicitarRenovacion = (prestamoId, userId) => {
    const pr = prestamos.find(p=>p.id===prestamoId); if(!pr) return;
    if(pr.renovado||pr.renewalStatus==="approved"){ addToast("Este préstamo ya fue renovado.","error"); return; }
    if(pr.renewalStatus==="pending"){ addToast("Ya existe una solicitud pendiente.","warning"); return; }
    setPrestamos(p=>p.map(x=>x.id===prestamoId?{...x,renewalStatus:"pending"}:x));
    log("Solicitud renovación",books.find(b=>b.id===pr.bookId)?.titulo, userId);
    addToast("Solicitud de renovación enviada. El bibliotecario debe confirmarla.","warning");
  };

  const aprobarRenovacion = prestamoId => {
    const pr = prestamos.find(p=>p.id===prestamoId); if(!pr) return;
    const book = books.find(b=>b.id===pr.bookId);
    const nuevaFecha = addDays(params.diasPrestamo, parseCL(pr.fechaDevolucion));
    setPrestamos(p=>p.map(x=>x.id===prestamoId?{...x,fechaDevolucion:nuevaFecha,renovado:true,renewalStatus:"approved"}:x));
    setUserNotifs(p=>[...p,{id:Date.now(),targetUserId:pr.userId,mensaje:`✅ Tu solicitud de renovación para "${book?.titulo}" fue aprobada. Nueva fecha: ${nuevaFecha}.`,bookTitle:book?.titulo,fecha:fmtDate(new Date()),leida:false}]);
    log("Renovación aprobada",book?.titulo);
    addToast(`Renovación aprobada para "${book?.titulo}".`,"success");
  };

  const rechazarRenovacion = prestamoId => {
    const pr = prestamos.find(p=>p.id===prestamoId); if(!pr) return;
    const book = books.find(b=>b.id===pr.bookId);
    setPrestamos(p=>p.map(x=>x.id===prestamoId?{...x,renewalStatus:"rejected"}:x));
    setUserNotifs(p=>[...p,{id:Date.now(),targetUserId:pr.userId,mensaje:`❌ Tu solicitud de renovación para "${book?.titulo}" fue rechazada. Por favor devuélvelo en la fecha original.`,bookTitle:book?.titulo,fecha:fmtDate(new Date()),leida:false}]);
    log("Renovación rechazada",book?.titulo);
    addToast(`Renovación rechazada para "${book?.titulo}".`,"warning");
  };

  const enviarNotificacion = (targetUserId, targetUserName, mensaje, bookTitle) => {
    setUserNotifs(p=>[...p,{id:Date.now(),targetUserId,mensaje,bookTitle,fecha:fmtDate(new Date()),leida:false}]);
    log("Notificación enviada",`→ ${targetUserName}: ${mensaje}`);
    addToast(`Notificación enviada a ${targetUserName}`,"success");
  };

  // misNotificaciones: lee directamente del estado React — reactividad garantizada
  const misNotificaciones = useCallback(
    (userId) => userNotifs.filter(n => n.targetUserId === userId && !n.leida),
    [userNotifs]
  );
  const marcarLeida = id => setUserNotifs(p=>p.map(n=>n.id===id?{...n,leida:true}:n));

  const selfRegister = ({nombre, usuario, password}) => {
    if(users.some(u=>u.usuario===usuario)) return "El usuario ya existe.";
    const errors = validatePassword(password);
    if(errors.length) return errors[0];
    const nu = {id:Date.now(),nombre,usuario,password,rol:"Usuario",estado:"activo"};
    setUsers(p=>ensureSeedAdmin([...p,nu]));
    log("Auto-registro",nombre,nombre);
    return null;
  };

  return (
    <AppCtx.Provider value={{
      session,effectiveRole,viewAs,setViewAs,login,logout,
      books,addBook,updateBook,deleteBook,updateStock,
      users,addUser,updateUser,deleteUser,toggleUser,selfRegister,
      prestamos,misActivos,registrarPrestamo,registrarDevolucion,
      solicitarRenovacion,aprobarRenovacion,rechazarRenovacion,
      params,updateParams,
      auditLog,sysNotifs,
      userNotifs,enviarNotificacion,misNotificaciones,marcarLeida,
      toasts,addToast,
    }}>
      {children}
    </AppCtx.Provider>
  );
}

// ─── TOAST ───────────────────────────────────────────────────
function ToastContainer() {
  const { toasts } = useApp();
  if(!toasts.length) return null;
  const cfg = {
    success:{bg:"#F0FDF4",border:"#BBF7D0",color:"#166534",icon:"✓"},
    error:  {bg:"#FEF2F2",border:"#FECACA",color:"#991B1B",icon:"✕"},
    warning:{bg:"#FFFBEB",border:"#FDE68A",color:"#92400E",icon:"⚠"},
  };
  return (
    <div style={{position:"fixed",top:68,right:16,zIndex:1000,display:"flex",flexDirection:"column",gap:8}}>
      {toasts.map(t=>{const c=cfg[t.type]||cfg.success;return(
        <div key={t.id} style={{background:c.bg,border:`1px solid ${c.border}`,borderRadius:10,padding:"12px 16px",maxWidth:340,display:"flex",gap:10,boxShadow:"0 4px 16px rgba(0,0,0,0.1)"}}>
          <span style={{color:c.color,fontWeight:700,fontSize:14,flexShrink:0}}>{c.icon}</span>
          <p style={{margin:0,fontSize:13,color:c.color,lineHeight:1.4}}>{t.msg}</p>
        </div>
      );})}
    </div>
  );
}

// ─── UI ATOMS ────────────────────────────────────────────────
const DuocLogoSVG = ({height=36}) => (
  <svg height={height} viewBox="0 0 160 44" xmlns="http://www.w3.org/2000/svg">
    <text x="0"   y="38" fontFamily="'Arial Black',sans-serif" fontWeight="900" fontSize="40" fill="#F5A623">Duoc</text>
    <text x="104" y="38" fontFamily="'Arial Black',sans-serif" fontWeight="900" fontSize="40" fill="#FFFFFF">UC</text>
  </svg>
);

const STATUS_CFG = {
  disponible:   {bg:"#DCFCE7",color:"#166534",label:"Disponible"},
  prestado:     {bg:"#FEE2E2",color:"#991B1B",label:"Prestado"},
  reservado:    {bg:"#DBEAFE",color:"#1E40AF",label:"Reservado"},
  activo:       {bg:"#DCFCE7",color:"#166534",label:"Activo"},
  suspendido:   {bg:"#FEE2E2",color:"#991B1B",label:"Suspendido"},
  mora:         {bg:"#FEF3C7",color:"#92400E",label:"Mora"},
  Admin:        {bg:"#F3E8FF",color:"#6B21A8",label:"Admin"},
  Bibliotecario:{bg:"#FFF3CD",color:"#92400E",label:"Bibliotecario"},
  Usuario:      {bg:"#DBEAFE",color:"#1E40AF",label:"Usuario"},
};
function Badge({estado,custom=null}){
  const c=STATUS_CFG[estado]||{bg:"#F1F5F9",color:"#475569",label:custom||estado};
  return <span style={{background:c.bg,color:c.color,fontSize:11,fontWeight:500,padding:"3px 9px",borderRadius:99,whiteSpace:"nowrap"}}>{custom||c.label}</span>;
}
function KpiCard({label,value,accent,sub=null,icon:Icon=null}){
  return(
    <div style={{background:"#fff",border:"0.5px solid #E2E8F0",borderRadius:12,padding:"14px 18px",borderTop:`3px solid ${accent}`}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
        <p style={{margin:"0 0 4px",fontSize:11,color:"#94A3B8",textTransform:"uppercase",letterSpacing:0.5}}>{label}</p>
        {Icon&&<Icon size={16} color={accent} style={{opacity:0.7}}/>}
      </div>
      <p style={{margin:0,fontSize:26,fontWeight:500,color:"#1E293B"}}>{value}</p>
      {sub&&<p style={{margin:"2px 0 0",fontSize:11,color:"#94A3B8"}}>{sub}</p>}
    </div>
  );
}
function IconBtn({icon:Icon,color,bg,title,onClick,disabled=false}){
  return(
    <button onClick={onClick} title={title} disabled={disabled}
      style={{background:disabled?"#F8FAFC":bg,border:"none",borderRadius:6,padding:"5px 7px",cursor:disabled?"default":"pointer",display:"flex",alignItems:"center",opacity:disabled?0.45:1}}>
      <Icon size={14} color={disabled?"#94A3B8":color}/>
    </button>
  );
}
function Card({children,style={}}){
  return <div style={{background:"#fff",border:"0.5px solid #E2E8F0",borderRadius:12,...style}}>{children}</div>;
}
function SectionTitle({icon:Icon,label,count=null}){
  return(
    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:18}}>
      {Icon&&<Icon size={17} color="#003366"/>}
      <h2 style={{margin:0,fontSize:17,fontWeight:500,color:"#1E293B"}}>{label}</h2>
      {count!=null&&<span style={{background:"#EFF6FF",color:"#003366",fontSize:11,fontWeight:500,padding:"2px 8px",borderRadius:99}}>{count}</span>}
    </div>
  );
}
function CatalogFilters({query,setQuery,catFilter,setCatFilter,estadoFilter,setEstadoFilter}){
  return(
    <div style={{display:"flex",flexWrap:"wrap",gap:10,marginBottom:20}}>
      <div style={{position:"relative",flex:"1 1 200px"}}>
        <Search size={14} style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:"#94A3B8"}}/>
        <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar título, autor o ISBN..."
          style={{paddingLeft:32,width:"100%",boxSizing:"border-box"}}/>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:6}}>
        <Filter size={13} color="#94A3B8"/>
        <select value={catFilter} onChange={e=>setCatFilter(e.target.value)} style={{fontSize:13,borderRadius:8,padding:"7px 10px",border:"0.5px solid #E2E8F0",background:"#fff",color:"#475569"}}>
          {CATEGORIAS.map(c=><option key={c}>{c}</option>)}
        </select>
        <select value={estadoFilter} onChange={e=>setEstadoFilter(e.target.value)} style={{fontSize:13,borderRadius:8,padding:"7px 10px",border:"0.5px solid #E2E8F0",background:"#fff",color:"#475569"}}>
          {ESTADOS_FILTER.map(e=><option key={e}>{e}</option>)}
        </select>
      </div>
    </div>
  );
}

// ─── NOTIF BELL ──────────────────────────────────────────────
function NotifBell(){
  const {session,effectiveRole,sysNotifs,misNotificaciones,marcarLeida}=useApp();
  const [open,setOpen]=useState(false);
  const isUser=effectiveRole==="Usuario";
  const personal=isUser?misNotificaciones(session.userId):[];
  const staff=!isUser?sysNotifs:[];
  const displayed=isUser?personal:staff;
  const unread=displayed.length;
  return(
    <div style={{position:"relative"}}>
      <button onClick={()=>setOpen(o=>!o)} style={{background:"none",border:"none",cursor:"pointer",position:"relative",display:"flex",alignItems:"center",padding:4}}>
        <Bell size={18} color="#93C5FD"/>
        {unread>0&&<span style={{position:"absolute",top:-2,right:-2,background:"#EF4444",color:"#fff",fontSize:9,fontWeight:700,width:15,height:15,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center"}}>{unread}</span>}
      </button>
      {open&&(
        <div style={{position:"absolute",top:34,right:0,background:"#fff",borderRadius:12,border:"0.5px solid #E2E8F0",boxShadow:"0 8px 28px rgba(0,0,0,0.13)",width:320,zIndex:200}}>
          <div style={{padding:"12px 16px",borderBottom:"0.5px solid #E2E8F0",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <p style={{margin:0,fontSize:13,fontWeight:500,color:"#1E293B"}}>Notificaciones</p>
            <button onClick={()=>setOpen(false)} style={{background:"none",border:"none",cursor:"pointer",color:"#94A3B8"}}><X size={14}/></button>
          </div>
          <div style={{maxHeight:300,overflowY:"auto"}}>
            {displayed.length===0&&<p style={{padding:16,fontSize:13,color:"#94A3B8",textAlign:"center",margin:0}}>Sin notificaciones</p>}
            {displayed.map(n=>(
              <div key={n.id} style={{padding:"10px 16px",borderBottom:"0.5px solid #F8FAFC",display:"flex",gap:10,alignItems:"flex-start",background:n.type==="danger"?"#FFF5F5":n.type==="warning"?"#FFFBEB":"#F0FDF4"}}>
                {n.type==="danger"?<AlertCircle size={14} color="#DC2626" style={{flexShrink:0,marginTop:1}}/>:
                 n.type==="warning"?<AlertTriangle size={14} color="#D97706" style={{flexShrink:0,marginTop:1}}/>:
                 <Bell size={14} color="#003366" style={{flexShrink:0,marginTop:1}}/>}
                <div style={{flex:1}}>
                  <p style={{margin:0,fontSize:12,color:"#475569",lineHeight:1.45}}>{n.msg||n.mensaje}</p>
                  {n.fecha&&<p style={{margin:"3px 0 0",fontSize:10,color:"#94A3B8"}}>{n.fecha}</p>}
                </div>
                {isUser&&<button onClick={()=>marcarLeida(n.id)} style={{background:"none",border:"none",cursor:"pointer",color:"#94A3B8",flexShrink:0,padding:0}}><CheckCircle size={13}/></button>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ROLE EMULATOR ───────────────────────────────────────────
function RoleEmulator(){
  const {session,viewAs,setViewAs}=useApp();
  const [open,setOpen]=useState(false);
  if(session?.rol!=="Admin") return null;
  const current=viewAs||"Admin";
  const opts=[
    {value:"Admin",        label:"Vista: Administrador",color:"#6B21A8",bg:"#F3E8FF"},
    {value:"Bibliotecario",label:"Vista: Bibliotecario", color:"#92400E",bg:"#FFF3CD"},
    {value:"Usuario",      label:"Vista: Usuario",       color:"#1E40AF",bg:"#DBEAFE"},
  ];
  const selected=opts.find(o=>o.value===current);
  return(
    <div style={{position:"relative"}}>
      <button onClick={()=>setOpen(o=>!o)} style={{display:"flex",alignItems:"center",gap:6,padding:"5px 12px",borderRadius:8,border:"1px solid #ffffff25",background:"rgba(255,255,255,0.08)",color:"#fff",cursor:"pointer",fontSize:12}}>
        <Eye size={13} color="#93C5FD"/><span style={{color:"#E0F2FE"}}>{selected?.label}</span><ChevronDown size={12} color="#93C5FD"/>
      </button>
      {open&&(
        <div style={{position:"absolute",top:36,right:0,background:"#fff",borderRadius:10,border:"0.5px solid #E2E8F0",boxShadow:"0 8px 24px rgba(0,0,0,0.12)",width:220,zIndex:200,overflow:"hidden"}}>
          <div style={{padding:"8px 12px",borderBottom:"0.5px solid #E2E8F0",display:"flex",alignItems:"center",gap:6}}>
            <ShieldAlert size={13} color="#6B21A8"/>
            <p style={{margin:0,fontSize:11,color:"#6B21A8",fontWeight:500}}>Emulación de vista</p>
          </div>
          {opts.map(o=>(
            <button key={o.value} onClick={()=>{setViewAs(o.value==="Admin"?null:o.value);setOpen(false);}}
              style={{width:"100%",padding:"10px 14px",border:"none",background:current===o.value?o.bg:"#fff",cursor:"pointer",display:"flex",alignItems:"center",gap:8,textAlign:"left",borderBottom:"0.5px solid #F8FAFC"}}>
              {current===o.value?<CheckCircle size={13} color={o.color}/>:<div style={{width:13}}/>}
              <span style={{fontSize:13,color:o.color,fontWeight:current===o.value?500:400}}>{o.label}</span>
            </button>
          ))}
          <div style={{padding:"8px 12px",background:"#FFFBEB"}}>
            <p style={{margin:0,fontSize:11,color:"#92400E"}}>⚠ Solo cambia la vista. Tu rol real es Admin.</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── NAVBAR & SIDEBAR ────────────────────────────────────────
function Navbar({onToggleSidebar=()=>{}}){
  const {session,logout}=useApp();
  const isMobile=useIsMobile();
  return(
    <nav style={{background:"#003366",color:"#fff",padding:"0 16px",height:56,display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:50}}>
      <div style={{display:"flex",alignItems:"center",gap:isMobile?8:12}}>
        {session&&isMobile&&(
          <button onClick={onToggleSidebar} style={{background:"none",border:"none",cursor:"pointer",color:"#fff",display:"flex",alignItems:"center",padding:"4px 2px",flexShrink:0}}>
            <Menu size={20} color="#fff"/>
          </button>
        )}
        <DuocLogoSVG height={28}/>
        {!isMobile&&<>
          <div style={{width:1,height:24,background:"#ffffff20"}}/>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <Library size={15} color="#93C5FD"/>
            <span style={{fontSize:13,color:"#93C5FD"}}>Sistema de Gestión Bibliotecaria</span>
          </div>
        </>}
      </div>
      {session&&(
        <div style={{display:"flex",alignItems:"center",gap:isMobile?8:12}}>
          {!isMobile&&<RoleEmulator/>}
          <NotifBell/>
          {!isMobile&&<div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{width:30,height:30,borderRadius:"50%",background:"#1D4ED8",display:"flex",alignItems:"center",justifyContent:"center"}}><User size={14} color="#fff"/></div>
            <div style={{lineHeight:1.2}}>
              <p style={{margin:0,fontSize:12,fontWeight:500}}>{session.nombre}</p>
              <p style={{margin:0,fontSize:10,color:"#93C5FD"}}>{session.rol}</p>
            </div>
          </div>}
          <button onClick={logout} style={{background:"transparent",border:"1px solid #ffffff25",borderRadius:6,padding:"4px 10px",color:"#fff",cursor:"pointer",display:"flex",alignItems:"center",gap:4,fontSize:11}}>
            <LogOut size={12}/>{!isMobile&&" Salir"}
          </button>
        </div>
      )}
    </nav>
  );
}

function Sidebar({activeTab,setActiveTab,badge={},open=false,onClose=()=>{}}){
  const {effectiveRole}=useApp();
  const isMobile=useIsMobile();
  const items=useMemo(()=>{
    const all=[];
    if(hasLevel(effectiveRole,"Usuario")){
      all.push({id:"catalogo",label:"Catálogo",icon:BookOpen});
      all.push({id:"misprestamos",label:"Mis Préstamos",icon:CalendarClock});
    }
    if(hasLevel(effectiveRole,"Bibliotecario")){
      all.push({id:"sep1",divider:true});
      all.push({id:"inventario",label:"Inventario",icon:BookMarked});
      all.push({id:"prestamos",label:"Préstamos",icon:BookCopy});
      all.push({id:"notificaciones",label:"Notificaciones",icon:MessageSquare});
      all.push({id:"reportes",label:"Reportes",icon:BarChart3});
    }
    if(hasLevel(effectiveRole,"Admin")){
      all.push({id:"sep2",divider:true});
      all.push({id:"usuarios",label:"Usuarios",icon:UserCog});
      all.push({id:"params",label:"Configuración",icon:Sliders});
      all.push({id:"auditoria",label:"Auditoría",icon:ClipboardList});
    }
    return all;
  },[effectiveRole]);

  const desktopStyle = {width:208,minHeight:"calc(100vh - 56px)",background:"#F8FAFC",borderRight:"0.5px solid #E2E8F0",padding:"12px 0",flexShrink:0};
  const mobileStyle  = {position:"fixed" as const,top:56,left:0,width:220,bottom:0,background:"#F8FAFC",borderRight:"0.5px solid #E2E8F0",padding:"12px 0",zIndex:100,overflowY:"auto" as const,transform:open?"translateX(0)":"translateX(-100%)",transition:"transform 0.25s ease",boxShadow:open?"4px 0 24px rgba(0,0,0,0.18)":"none"};

  return(
    <>
      {isMobile&&open&&<div onClick={onClose} style={{position:"fixed",inset:0,top:56,background:"rgba(0,0,0,0.4)",zIndex:99}}/>}
      <aside style={isMobile?mobileStyle:desktopStyle}>
        <p style={{margin:"0 16px 10px",fontSize:10,color:"#CBD5E1",textTransform:"uppercase",letterSpacing:1.2}}>Navegación</p>
        {items.map(({id,label,icon:Icon,divider})=>{
          if(divider) return <div key={id} style={{height:1,background:"#E2E8F0",margin:"8px 14px"}}/>;
          const active=activeTab===id;
          const cnt=badge[id]||0;
          return(
            <button key={id} onClick={()=>{setActiveTab(id);if(isMobile)onClose();}} style={{width:"100%",background:active?"#EFF6FF":"transparent",border:"none",borderLeft:active?"3px solid #003366":"3px solid transparent",padding:"10px 14px",textAlign:"left",display:"flex",alignItems:"center",gap:9,color:active?"#003366":"#64748B",fontWeight:active?500:400,fontSize:13,cursor:"pointer"}}>
              <Icon size={15}/><span style={{flex:1}}>{label}</span>
              {cnt>0&&<span style={{background:"#EF4444",color:"#fff",fontSize:10,padding:"1px 6px",borderRadius:99,minWidth:18,textAlign:"center"}}>{cnt}</span>}
            </button>
          );
        })}
      </aside>
    </>
  );
}

function Breadcrumb({section}){
  const {effectiveRole,session,viewAs}=useApp();
  return(
    <div style={{padding:"11px 24px 9px",borderBottom:"0.5px solid #E2E8F0",background:"#fff",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
      <div style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:"#94A3B8"}}>
        <LayoutDashboard size={12}/><span>{effectiveRole}</span><ChevronRight size={11}/>
        <span style={{color:"#003366",fontWeight:500}}>{section}</span>
      </div>
      {viewAs&&session?.rol==="Admin"&&(
        <div style={{display:"flex",alignItems:"center",gap:6,background:"#FFFBEB",border:"0.5px solid #FDE68A",borderRadius:8,padding:"4px 10px"}}>
          <Eye size={12} color="#D97706"/>
          <span style={{fontSize:11,color:"#92400E",fontWeight:500}}>Emulando vista: {viewAs}</span>
        </div>
      )}
    </div>
  );
}

// ─── MODALS ──────────────────────────────────────────────────
function ModalShell({title,onClose,children,maxWidth=480}){
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200,padding:16}}>
      <div style={{background:"#fff",borderRadius:14,padding:28,width:"100%",maxWidth,boxSizing:"border-box",maxHeight:"90vh",overflowY:"auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
          <h2 style={{margin:0,fontSize:17,fontWeight:500,color:"#1E293B"}}>{title}</h2>
          <button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",color:"#94A3B8"}}><X size={20}/></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function BookModal({initial,onClose,onSave}){
  const [f,setF]=useState(initial||EMPTY_BOOK);
  const set=(k,v)=>setF(p=>({...p,[k]:v}));
  const isEdit=!!initial?.id;
  const field=(label,key,ph,type="text")=>(
    <div style={{display:"flex",flexDirection:"column",gap:4}}>
      <label style={{fontSize:12,color:"#64748B"}}>{label}</label>
      <input type={type} value={f[key]} onChange={e=>set(key,e.target.value)} placeholder={ph} style={{width:"100%",boxSizing:"border-box"}}/>
    </div>
  );
  return(
    <ModalShell title={isEdit?"Editar libro":"Registrar libro"} onClose={onClose}>
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        {field("Título *","titulo","Ej: Clean Code")}
        {field("Autor *","autor","Ej: Robert C. Martin")}
        {field("ISBN","isbn","978-0-00-000000-0")}
        <div style={{display:"flex",flexDirection:"column",gap:4}}>
          <label style={{fontSize:12,color:"#64748B"}}>Categoría</label>
          <select value={f.categoria} onChange={e=>set("categoria",e.target.value)} style={{width:"100%",boxSizing:"border-box"}}>
            {CATEGORIAS.filter(c=>c!=="Todas").map(c=><option key={c}>{c}</option>)}
          </select>
        </div>
        {field("URL Portada","portada","https://...")}
        {field("Ubicación física","ubicacion","Ej: Estante A-1")}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <div style={{display:"flex",flexDirection:"column",gap:4}}>
            <label style={{fontSize:12,color:"#64748B"}}>Estado</label>
            <select value={f.estado} onChange={e=>set("estado",e.target.value)} style={{width:"100%",boxSizing:"border-box"}}>
              <option value="disponible">Disponible</option><option value="prestado">Prestado</option>
            </select>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:4}}>
            <label style={{fontSize:12,color:"#64748B"}}>Stock</label>
            <input type="number" min="0" value={f.stock} onChange={e=>set("stock",e.target.value)} style={{width:"100%",boxSizing:"border-box"}}/>
          </div>
        </div>
      </div>
      <div style={{display:"flex",gap:10,marginTop:20,justifyContent:"flex-end"}}>
        <button onClick={onClose} style={{padding:"8px 18px",borderRadius:8,border:"0.5px solid #E2E8F0",background:"#fff",color:"#475569",cursor:"pointer",fontSize:13}}>Cancelar</button>
        <button onClick={()=>{if(!f.titulo.trim()||!f.autor.trim())return;onSave(f);onClose();}}
          style={{padding:"8px 20px",borderRadius:8,border:"none",background:"#003366",color:"#fff",cursor:"pointer",fontSize:13,fontWeight:500}}>
          {isEdit?"Guardar":"Registrar"}
        </button>
      </div>
    </ModalShell>
  );
}

function UserModal({initial,onClose,onSave}){
  const [f,setF]=useState(initial||EMPTY_USER);
  const set=(k,v)=>setF(p=>({...p,[k]:v}));
  const isEdit=!!initial?.id;
  const field=(label,key,ph,type="text")=>(
    <div style={{display:"flex",flexDirection:"column",gap:4}}>
      <label style={{fontSize:12,color:"#64748B"}}>{label}</label>
      <input type={type} value={f[key]} onChange={e=>set(key,e.target.value)} placeholder={ph} style={{width:"100%",boxSizing:"border-box"}}/>
    </div>
  );
  return(
    <ModalShell title={isEdit?"Editar usuario":"Registrar usuario"} onClose={onClose} maxWidth={420}>
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        {field("Nombre *","nombre","Ej: Ana Torres")}
        {field("Usuario *","usuario","Ej: ana.torres")}
        {field("Contraseña","password","••••••","password")}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <div style={{display:"flex",flexDirection:"column",gap:4}}>
            <label style={{fontSize:12,color:"#64748B"}}>Rol</label>
            <select value={f.rol} onChange={e=>set("rol",e.target.value)} style={{width:"100%",boxSizing:"border-box"}}>
              {ROLES.map(r=><option key={r}>{r}</option>)}
            </select>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:4}}>
            <label style={{fontSize:12,color:"#64748B"}}>Estado</label>
            <select value={f.estado} onChange={e=>set("estado",e.target.value)} style={{width:"100%",boxSizing:"border-box"}}>
              <option value="activo">Activo</option><option value="suspendido">Suspendido</option>
            </select>
          </div>
        </div>
      </div>
      <div style={{display:"flex",gap:10,marginTop:20,justifyContent:"flex-end"}}>
        <button onClick={onClose} style={{padding:"8px 18px",borderRadius:8,border:"0.5px solid #E2E8F0",background:"#fff",color:"#475569",cursor:"pointer",fontSize:13}}>Cancelar</button>
        <button onClick={()=>{if(!f.nombre.trim()||!f.usuario.trim())return;onSave(f);onClose();}}
          style={{padding:"8px 20px",borderRadius:8,border:"none",background:"#003366",color:"#fff",cursor:"pointer",fontSize:13,fontWeight:500}}>
          {isEdit?"Guardar":"Registrar"}
        </button>
      </div>
    </ModalShell>
  );
}

function StockModal({book,onClose,onUpdate}){
  const [delta,setDelta]=useState(1);const [op,setOp]=useState("agregar");
  return(
    <ModalShell title="Gestionar stock" onClose={onClose} maxWidth={360}>
      <div style={{display:"flex",alignItems:"center",gap:12,background:"#F8FAFC",borderRadius:8,padding:"10px 14px",marginBottom:16}}>
        <img src={book.portada} alt="" style={{width:42,height:52,objectFit:"cover",borderRadius:4,background:"#EEF2FF",flexShrink:0}} onError={e=>{e.currentTarget.style.background="#EEF2FF";e.currentTarget.src="";}}/>
        <div>
          <p style={{margin:0,fontWeight:500,fontSize:14,color:"#1E293B"}}>{book.titulo}</p>
          <p style={{margin:"2px 0 0",fontSize:12,color:"#94A3B8"}}>Stock actual: <strong style={{color:"#003366"}}>{book.stock}</strong></p>
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
        {["agregar","retirar"].map(o=>(
          <button key={o} onClick={()=>setOp(o)} style={{padding:"8px 0",borderRadius:8,fontSize:13,cursor:"pointer",fontWeight:op===o?500:400,border:op===o?"2px solid #003366":"0.5px solid #E2E8F0",background:op===o?"#EFF6FF":"#fff",color:op===o?"#003366":"#475569"}}>
            {o==="agregar"?"+ Agregar":"− Retirar"}
          </button>
        ))}
      </div>
      <input type="number" min="1" value={delta} onChange={e=>setDelta(+e.target.value||1)} style={{width:"100%",boxSizing:"border-box",marginBottom:20}}/>
      <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
        <button onClick={onClose} style={{padding:"8px 18px",borderRadius:8,border:"0.5px solid #E2E8F0",background:"#fff",color:"#475569",cursor:"pointer",fontSize:13}}>Cancelar</button>
        <button onClick={()=>{onUpdate(book.id,op==="agregar"?delta:-delta);onClose();}} style={{padding:"8px 20px",borderRadius:8,border:"none",background:"#003366",color:"#fff",cursor:"pointer",fontSize:13,fontWeight:500}}>Confirmar</button>
      </div>
    </ModalShell>
  );
}

function ConfirmPrestamoModal({book,fechaDev,onConfirm,onCancel}){
  return(
    <ModalShell title="Confirmar préstamo" onClose={onCancel} maxWidth={400}>
      <div style={{display:"flex",gap:14,marginBottom:14}}>
        <img src={book.portada} alt="" style={{width:52,height:66,objectFit:"cover",borderRadius:6,background:"#EEF2FF",flexShrink:0}} onError={e=>{e.currentTarget.style.background="#EEF2FF";e.currentTarget.src="";}}/>
        <div><p style={{margin:"0 0 4px",fontSize:14,fontWeight:500,color:"#1E293B"}}>{book.titulo}</p><p style={{margin:0,fontSize:12,color:"#94A3B8"}}>{book.autor}</p></div>
      </div>
      <div style={{background:"#F0FDF4",border:"0.5px solid #BBF7D0",borderRadius:8,padding:"10px 14px",marginBottom:18}}>
        <p style={{margin:0,fontSize:13,color:"#166534"}}>📅 Fecha de devolución: <strong>{fechaDev}</strong></p>
      </div>
      <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
        <button onClick={onCancel} style={{padding:"8px 18px",borderRadius:8,border:"0.5px solid #E2E8F0",background:"#fff",color:"#475569",cursor:"pointer",fontSize:13}}>Cancelar</button>
        <button onClick={onConfirm} style={{padding:"8px 20px",borderRadius:8,border:"none",background:"#003366",color:"#fff",cursor:"pointer",fontSize:13,fontWeight:500}}>Confirmar</button>
      </div>
    </ModalShell>
  );
}

function ConfirmDevolucionModal({prestamo,onConfirm,onCancel}){
  const {books,users,params}=useApp();
  const book=books.find(b=>b.id===prestamo.bookId);
  const user=users.find(u=>u.usuario===prestamo.userId);
  const vencido=isOver(prestamo.fechaDevolucion);
  const dl=daysLeft(prestamo.fechaDevolucion);
  const diasMora=vencido?Math.abs(dl):0;
  const multa=diasMora*params.multaPorDia;
  const META=[["Fecha de préstamo",prestamo.fechaInicio],["Fecha de vencimiento",prestamo.fechaDevolucion],["Fecha de devolución",fmtDate(new Date())+" (hoy)"]];
  return(
    <ModalShell title="Confirmar devolución" onClose={onCancel} maxWidth={440}>
      <div style={{display:"flex",gap:14,marginBottom:16}}>
        <img src={book?.portada} alt="" style={{width:54,height:68,objectFit:"cover",borderRadius:8,background:"#EEF2FF",flexShrink:0}} onError={e=>{e.currentTarget.style.background="#EEF2FF";e.currentTarget.src="";}}/>
        <div style={{flex:1}}>
          <p style={{margin:"0 0 3px",fontSize:15,fontWeight:500,color:"#1E293B"}}>{book?.titulo}</p>
          <p style={{margin:"0 0 6px",fontSize:12,color:"#64748B"}}>{book?.autor}</p>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <div style={{width:22,height:22,borderRadius:"50%",background:"#EFF6FF",display:"flex",alignItems:"center",justifyContent:"center"}}><span style={{fontSize:9,fontWeight:700,color:"#003366"}}>{user?.nombre.split(" ").map(n=>n[0]).join("").slice(0,2)}</span></div>
            <span style={{fontSize:13,color:"#475569",fontWeight:500}}>{user?.nombre}</span>
          </div>
        </div>
      </div>
      <div style={{background:"#F8FAFC",borderRadius:10,padding:"12px 14px",marginBottom:14,display:"flex",flexDirection:"column",gap:8}}>
        {META.map(([l,v],i)=>(
          <div key={l}>
            {i>0&&<div style={{height:1,background:"#E2E8F0",marginBottom:8}}/>}
            <div style={{display:"flex",justifyContent:"space-between",fontSize:13}}>
              <span style={{color:"#64748B"}}>{l}</span>
              <span style={{color:l.includes("vencimiento")&&vencido?"#DC2626":"#1E293B",fontWeight:500}}>{v}</span>
            </div>
          </div>
        ))}
      </div>
      {vencido?(
        <div style={{background:"#FEF2F2",border:"1px solid #FECACA",borderRadius:10,padding:"12px 14px",marginBottom:18}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}><AlertCircle size={16} color="#DC2626"/><span style={{fontSize:13,fontWeight:600,color:"#991B1B"}}>Devolución con atraso</span></div>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:4}}><span style={{color:"#991B1B"}}>Días de mora</span><span style={{fontWeight:600,color:"#DC2626"}}>{diasMora}d</span></div>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:13}}><span style={{color:"#991B1B"}}>Multa a cobrar</span><span style={{fontWeight:700,color:"#DC2626",fontSize:14}}>${multa.toLocaleString("es-CL")} CLP</span></div>
        </div>
      ):(
        <div style={{background:"#F0FDF4",border:"0.5px solid #BBF7D0",borderRadius:10,padding:"12px 14px",marginBottom:18,display:"flex",alignItems:"center",gap:8}}>
          <CheckCircle size={16} color="#16A34A"/>
          <span style={{fontSize:13,color:"#166534",fontWeight:500}}>Devolución a tiempo · {dl} día{dl!==1?"s":""} antes del vencimiento</span>
        </div>
      )}
      <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
        <button onClick={onCancel} style={{padding:"9px 20px",borderRadius:8,border:"0.5px solid #E2E8F0",background:"#fff",color:"#475569",cursor:"pointer",fontSize:13}}>Cancelar</button>
        <button onClick={onConfirm} style={{padding:"9px 22px",borderRadius:8,border:"none",background:vencido?"#DC2626":"#16A34A",color:"#fff",cursor:"pointer",fontSize:13,fontWeight:500,display:"flex",alignItems:"center",gap:6}}>
          <RotateCcw size={14}/>{vencido?"Registrar con mora":"Confirmar devolución"}
        </button>
      </div>
    </ModalShell>
  );
}

function BookDetailModal({book,userId,onClose}){
  const {misActivos,registrarPrestamo,params}=useApp();
  const isMobile=useIsMobile();
  const [pending,setPending]=useState(false);
  const misIds=misActivos(userId).map(p=>p.bookId);
  const yaMio=misIds.includes(book.id);
  const sinStock=book.stock<=0||book.estado==="prestado";
  const fechaDev=addDays(params.diasPrestamo);

  const META=[
    {label:"Autor",           value:book.autor},
    {label:"Categoría",       value:book.categoria},
    {label:"ISBN",            value:book.isbn||"No registrado"},
    {label:"Ubicación física",value:book.ubicacion||"Consultar en recepción"},
  ];

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200,padding:16}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:"#fff",borderRadius:18,width:"100%",maxWidth:740,maxHeight:"90vh",overflow:"hidden",display:"flex",flexDirection:"column",boxShadow:"0 24px 64px rgba(0,0,0,0.25)"}}>

        {/* Header */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 22px",borderBottom:"0.5px solid #E2E8F0",flexShrink:0}}>
          <p style={{margin:0,fontSize:11,color:"#94A3B8",textTransform:"uppercase",letterSpacing:0.8}}>Detalle del libro</p>
          <button onClick={onClose} style={{background:"#F8FAFC",border:"0.5px solid #E2E8F0",borderRadius:8,width:30,height:30,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",color:"#64748B"}}><X size={15}/></button>
        </div>

        {/* Split View */}
        <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"220px 1fr",flex:1,overflow:"hidden"}}>

          {/* Portada */}
          <div style={{background:"#0F172A",position:"relative",overflow:"hidden",flexShrink:0,minHeight:isMobile?200:undefined}}>
            <img src={book.portada} alt={book.titulo} style={{width:"100%",height:isMobile?200:"100%",objectFit:"cover",display:"block",opacity:0.9}} onError={e=>{e.currentTarget.style.background="#1E293B";e.currentTarget.src="";}}/>
            <div style={{position:"absolute",inset:0,background:"linear-gradient(to top,rgba(0,0,0,0.6) 0%,transparent 50%)"}}/>
            <div style={{position:"absolute",top:12,left:12}}><Badge estado={book.estado}/></div>
          </div>

          {/* Info */}
          <div style={{padding:"24px 26px",overflowY:"auto",display:"flex",flexDirection:"column",gap:0}}>

            {/* Título + autor */}
            <div style={{marginBottom:18}}>
              <h1 style={{margin:"0 0 5px",fontSize:21,fontWeight:600,color:"#0F172A",lineHeight:1.25}}>{book.titulo}</h1>
              <p style={{margin:0,fontSize:14,color:"#64748B"}}>{book.autor}</p>
            </div>

            {/* Metadata */}
            <div style={{marginBottom:16,background:"#F8FAFC",borderRadius:10,overflow:"hidden",border:"0.5px solid #E2E8F0"}}>
              {META.map((m,i)=>(
                <div key={m.label} style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",padding:"10px 14px",borderBottom:i<META.length-1?"0.5px solid #E2E8F0":"none"}}>
                  <span style={{fontSize:12,color:"#94A3B8",fontWeight:500,flexShrink:0,marginRight:12}}>{m.label}</span>
                  <span style={{fontSize:13,color:"#1E293B",fontWeight:500,textAlign:"right"}}>{m.value}</span>
                </div>
              ))}
            </div>

            {/* Resumen */}
            {book.resumen&&(
              <p style={{margin:"0 0 20px",fontSize:13,color:"#475569",lineHeight:1.65,borderLeft:"3px solid #E2E8F0",paddingLeft:12}}>
                {book.resumen}
              </p>
            )}

            <div style={{flex:1}}/>

            {/* Acción */}
            <div style={{borderTop:"0.5px solid #E2E8F0",paddingTop:18}}>
              {yaMio?(
                <div style={{display:"flex",alignItems:"center",gap:10,background:"#F0FDF4",border:"0.5px solid #BBF7D0",borderRadius:10,padding:"12px 16px"}}>
                  <CheckCircle size={17} color="#16A34A"/>
                  <div><p style={{margin:0,fontSize:13,fontWeight:500,color:"#166534"}}>Ya tienes este libro prestado</p><p style={{margin:0,fontSize:11,color:"#16A34A"}}>Revisa la fecha en "Mis Préstamos".</p></div>
                </div>
              ):sinStock?(
                <div style={{display:"flex",alignItems:"center",gap:10,background:"#FEF2F2",border:"0.5px solid #FECACA",borderRadius:10,padding:"12px 16px"}}>
                  <AlertCircle size={17} color="#DC2626"/>
                  <div><p style={{margin:0,fontSize:13,fontWeight:500,color:"#991B1B"}}>Actualmente sin stock físico</p><p style={{margin:0,fontSize:11,color:"#DC2626"}}>Todos los ejemplares están prestados.</p></div>
                </div>
              ):pending?(
                <div style={{background:"#F0FDF4",border:"0.5px solid #BBF7D0",borderRadius:12,padding:"14px 16px"}}>
                  <p style={{margin:"0 0 4px",fontSize:13,fontWeight:500,color:"#166534"}}>📅 Fecha de devolución estimada</p>
                  <p style={{margin:"0 0 12px",fontSize:19,fontWeight:600,color:"#003366"}}>{fechaDev}</p>
                  <div style={{display:"flex",gap:8}}>
                    <button onClick={()=>setPending(false)} style={{flex:1,padding:"9px 0",borderRadius:8,border:"0.5px solid #E2E8F0",background:"#fff",color:"#475569",cursor:"pointer",fontSize:13}}>Cancelar</button>
                    <button onClick={()=>{const ok=registrarPrestamo(book.id,userId);if(ok)onClose();}} style={{flex:2,padding:"9px 0",borderRadius:8,border:"none",background:"#003366",color:"#fff",cursor:"pointer",fontSize:13,fontWeight:500,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
                      <CheckCircle size={14}/> Confirmar reserva
                    </button>
                  </div>
                </div>
              ):(
                <button onClick={()=>setPending(true)} style={{width:"100%",padding:"12px 0",borderRadius:10,border:"none",background:"#003366",color:"#fff",cursor:"pointer",fontSize:14,fontWeight:500,display:"flex",alignItems:"center",justifyContent:"center",gap:8,boxShadow:"0 2px 8px rgba(0,51,102,0.22)"}}>
                  <BookOpen size={16}/> Reservar este libro
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── VIEWS: NIVEL 1 (Usuario) ────────────────────────────────
function CatalogoView({userId}){
  const {books,misActivos,registrarPrestamo,params}=useApp();
  const [query,setQuery]=useState("");
  const [catF,setCatF]=useState("Todas");
  const [estF,setEstF]=useState("Todos");
  const [pending,setPending]=useState(null);
  const [detalle,setDetalle]=useState(null);
  const misIds=misActivos(userId).map(p=>p.bookId);
  const filtered=useMemo(()=>books.filter(b=>{
    const q=query.toLowerCase();
    return (b.titulo.toLowerCase().includes(q)||b.autor.toLowerCase().includes(q)||(b.isbn||"").includes(q))
      &&(catF==="Todas"||b.categoria===catF)&&(estF==="Todos"||b.estado===estF);
  }),[books,query,catF,estF]);
  const fechaDev=addDays(params.diasPrestamo);
  return(
    <div style={{padding:24}}>
      <CatalogFilters query={query} setQuery={setQuery} catFilter={catF} setCatFilter={setCatF} estadoFilter={estF} setEstadoFilter={setEstF}/>
      <p style={{margin:"0 0 14px",fontSize:13,color:"#94A3B8"}}>{filtered.length} libro(s) encontrado(s)</p>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(145px,1fr))",gap:16}}>
        {filtered.map(book=>{
          const yaMio=misIds.includes(book.id);
          return(
            <div key={book.id} style={{background:"#fff",borderRadius:12,border:"0.5px solid #E2E8F0",overflow:"hidden",display:"flex",flexDirection:"column"}}>
              <div style={{position:"relative",cursor:"pointer"}} onClick={()=>setDetalle(book)}>
                <img src={book.portada} alt="" style={{width:"100%",height:150,objectFit:"cover",background:"#EEF2FF",display:"block",transition:"opacity .15s"}}
                  onMouseOver={e=>e.currentTarget.style.opacity=".82"} onMouseOut={e=>e.currentTarget.style.opacity="1"}
                  onError={e=>{e.currentTarget.style.background="#EEF2FF";e.currentTarget.src="";}}/>
                <div style={{position:"absolute",top:8,left:8}}><Badge estado={book.estado}/></div>
                {book.stock>0&&<div style={{position:"absolute",top:8,right:8,background:"rgba(0,0,0,0.55)",color:"#fff",fontSize:10,padding:"2px 6px",borderRadius:99}}>{book.stock} ej.</div>}
              </div>
              <div style={{padding:"12px 12px 14px",flex:1,display:"flex",flexDirection:"column",gap:3}}>
                <p onClick={()=>setDetalle(book)} style={{margin:0,fontWeight:500,fontSize:13,color:"#1E293B",lineHeight:1.35,cursor:"pointer"}}
                  onMouseOver={e=>e.currentTarget.style.color="#003366"} onMouseOut={e=>e.currentTarget.style.color="#1E293B"}>
                  {book.titulo}
                </p>
                <p style={{margin:0,fontSize:11,color:"#94A3B8"}}>{book.autor}</p>
                <p style={{margin:"2px 0 0",fontSize:10,color:"#CBD5E1"}}>{book.categoria}</p>
                <div style={{marginTop:"auto",paddingTop:10}}>
                  {book.estado==="disponible"&&!yaMio&&book.stock>0&&(
                    <button onClick={()=>setPending(book)} style={{width:"100%",padding:"7px 0",borderRadius:7,background:"#003366",color:"#fff",border:"none",fontSize:12,fontWeight:500,cursor:"pointer"}}>Reservar</button>
                  )}
                  {yaMio&&<div style={{textAlign:"center",fontSize:11,color:"#16A34A",fontWeight:500,display:"flex",alignItems:"center",justifyContent:"center",gap:4}}><CheckCircle size={12}/>Tienes este libro</div>}
                  {!yaMio&&(book.estado==="prestado"||book.stock===0)&&<p style={{margin:0,fontSize:11,color:"#94A3B8",textAlign:"center"}}>Sin stock</p>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {pending&&<ConfirmPrestamoModal book={pending} fechaDev={fechaDev} onConfirm={()=>{registrarPrestamo(pending.id,userId);setPending(null);}} onCancel={()=>setPending(null)}/>}
      {detalle&&<BookDetailModal book={detalle} userId={userId} onClose={()=>setDetalle(null)}/>}
    </div>
  );
}

function MisPrestamosView({userId}){
  const {misActivos,books,solicitarRenovacion,registrarDevolucion,users,params}=useApp();
  const activos=misActivos(userId);
  const me=users.find(u=>u.usuario===userId);
  return(
    <div style={{padding:24,maxWidth:780}}>
      <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:24,background:"#fff",borderRadius:12,border:"0.5px solid #E2E8F0",padding:"18px 20px"}}>
        <div style={{width:52,height:52,borderRadius:"50%",background:"#003366",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
          <span style={{fontSize:18,fontWeight:600,color:"#fff"}}>{me?.nombre.split(" ").map(n=>n[0]).join("").slice(0,2)}</span>
        </div>
        <div style={{flex:1}}>
          <p style={{margin:"0 0 4px",fontSize:17,fontWeight:500,color:"#1E293B"}}>{me?.nombre}</p>
          <div style={{display:"flex",gap:8,alignItems:"center"}}><Badge estado={me?.rol}/><span style={{fontSize:12,color:"#94A3B8"}}>@{me?.usuario}</span></div>
        </div>
        <div style={{textAlign:"center",padding:"8px 16px",background:"#F8FAFC",borderRadius:10}}>
          <p style={{margin:0,fontSize:22,fontWeight:500,color:"#003366"}}>{activos.length}<span style={{fontSize:12,color:"#94A3B8"}}> / {params.limiteLibros}</span></p>
          <p style={{margin:0,fontSize:11,color:"#94A3B8"}}>préstamos activos</p>
        </div>
      </div>
      <div style={{marginBottom:20}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
          <span style={{fontSize:12,color:"#64748B"}}>Cuota de préstamos</span>
          <span style={{fontSize:12,fontWeight:500,color:activos.length>=params.limiteLibros?"#DC2626":"#64748B"}}>{activos.length} / {params.limiteLibros}</span>
        </div>
        <div style={{background:"#F1F5F9",borderRadius:99,height:8,overflow:"hidden"}}>
          <div style={{height:"100%",borderRadius:99,transition:"width .3s",background:activos.length>=params.limiteLibros?"#DC2626":activos.length===params.limiteLibros-1?"#D97706":"#003366",width:`${(activos.length/params.limiteLibros)*100}%`}}/>
        </div>
      </div>
      {activos.length===0?(
        <div style={{textAlign:"center",padding:"40px 0"}}>
          <BookOpen size={40} color="#CBD5E1" style={{margin:"0 auto 12px"}}/>
          <p style={{fontSize:15,fontWeight:500,color:"#94A3B8",margin:"0 0 4px"}}>Sin préstamos activos</p>
          <p style={{fontSize:13,color:"#CBD5E1",margin:0}}>Ve al catálogo para reservar libros.</p>
        </div>
      ):(
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {activos.map(pr=>{
            const book=books.find(b=>b.id===pr.bookId);if(!book)return null;
            const vencido=isOver(pr.fechaDevolucion);
            const dl=daysLeft(pr.fechaDevolucion);
            const urgente=!vencido&&dl<=2;
            const multa=vencido?Math.abs(dl)*params.multaPorDia:0;
            const isPending=pr.renewalStatus==="pending";
            const isApproved=pr.renovado&&pr.renewalStatus==="approved";
            const isRejected=pr.renewalStatus==="rejected";
            const disabledRenew=isPending||isApproved||isRejected;
            const renewLabel=isPending?"Renovación pendiente…":isApproved?"Ya renovado":isRejected?"Renovación rechazada":`Renovar +${params.diasPrestamo}d`;
            return(
              <div key={pr.id} style={{background:"#fff",borderRadius:12,border:`${vencido?"1px":"0.5px"} solid ${vencido?"#FECACA":urgente?"#FDE68A":"#E2E8F0"}`,padding:"14px 16px",display:"flex",gap:14,alignItems:"flex-start"}}>
                <img src={book.portada} alt="" style={{width:52,height:66,objectFit:"cover",borderRadius:6,background:"#EEF2FF",flexShrink:0}} onError={e=>{e.currentTarget.style.background="#EEF2FF";e.currentTarget.src="";}}/>
                <div style={{flex:1,minWidth:0}}>
                  <p style={{margin:"0 0 2px",fontWeight:500,fontSize:14,color:"#1E293B",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{book.titulo}</p>
                  <p style={{margin:"0 0 8px",fontSize:12,color:"#94A3B8"}}>{book.autor}</p>
                  {vencido?(
                    <div style={{display:"inline-flex",flexDirection:"column",gap:2,background:"#FEF2F2",border:"1px solid #FECACA",borderRadius:8,padding:"6px 10px",marginBottom:8}}>
                      <div style={{display:"flex",alignItems:"center",gap:4}}><AlertCircle size={12} color="#DC2626"/><span style={{fontSize:12,color:"#DC2626",fontWeight:500}}>Mora — venció el {pr.fechaDevolucion} ({Math.abs(dl)}d)</span></div>
                      <span style={{fontSize:11,color:"#DC2626"}}>Multa: ${multa.toLocaleString("es-CL")} CLP</span>
                    </div>
                  ):urgente?(
                    <div style={{display:"inline-flex",alignItems:"center",gap:4,background:"#FFFBEB",border:"1px solid #FDE68A",borderRadius:8,padding:"5px 10px",marginBottom:8}}>
                      <AlertTriangle size={12} color="#D97706"/><span style={{fontSize:12,color:"#92400E",fontWeight:500}}>Vence pronto: {pr.fechaDevolucion} ({dl}d)</span>
                    </div>
                  ):(
                    <div style={{display:"inline-flex",alignItems:"center",gap:4,background:"#F0FDF4",border:"0.5px solid #BBF7D0",borderRadius:8,padding:"5px 10px",marginBottom:8}}>
                      <CalendarClock size={12} color="#16A34A"/><span style={{fontSize:12,color:"#166534"}}>Devolver antes del {pr.fechaDevolucion}</span>
                    </div>
                  )}
                  {isPending&&<div style={{display:"inline-flex",alignItems:"center",gap:6,background:"#FFFBEB",border:"0.5px solid #FDE68A",borderRadius:8,padding:"4px 10px",marginBottom:6}}><RefreshCw size={12} color="#D97706"/><span style={{fontSize:11,color:"#92400E",fontWeight:500}}>Renovación pendiente de aprobación</span></div>}
                  {isRejected&&<div style={{display:"inline-flex",alignItems:"center",gap:6,background:"#FEF2F2",border:"0.5px solid #FECACA",borderRadius:8,padding:"4px 10px",marginBottom:6}}><X size={12} color="#DC2626"/><span style={{fontSize:11,color:"#DC2626",fontWeight:500}}>Renovación rechazada — devuelve en fecha original</span></div>}
                  {isApproved&&<p style={{margin:"0 0 6px",fontSize:11,color:"#16A34A",fontWeight:500}}>✓ Renovación aprobada</p>}
                  <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                    <button onClick={()=>solicitarRenovacion(pr.id,userId)} disabled={disabledRenew}
                      style={{display:"flex",alignItems:"center",gap:5,padding:"6px 12px",borderRadius:7,border:`0.5px solid ${isPending?"#FDE68A":isRejected?"#FECACA":"#BFDBFE"}`,background:isPending?"#FFFBEB":isRejected?"#FEF2F2":disabledRenew?"#F8FAFC":"#EFF6FF",color:isPending?"#92400E":isRejected?"#DC2626":disabledRenew?"#94A3B8":"#1D4ED8",fontSize:12,fontWeight:500,cursor:disabledRenew?"default":"pointer"}}>
                      <RefreshCw size={12}/>{renewLabel}
                    </button>
                    <button onClick={()=>registrarDevolucion(pr.id)} style={{display:"flex",alignItems:"center",gap:5,padding:"6px 12px",borderRadius:7,border:"0.5px solid #BBF7D0",background:"#F0FDF4",color:"#16A34A",fontSize:12,fontWeight:500,cursor:"pointer"}}>
                      <RotateCcw size={12}/> Devolver
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── VIEWS: NIVEL 2 (Bibliotecario) ─────────────────────────
function InventarioView(){
  const {books,addBook,updateBook,deleteBook,updateStock}=useApp();
  const [query,setQuery]=useState("");const [catF,setCatF]=useState("Todas");const [estF,setEstF]=useState("Todos");
  const [modal,setModal]=useState(null);const [stockM,setStockM]=useState(null);const [delB,setDelB]=useState(null);
  const filtered=useMemo(()=>books.filter(b=>{
    const q=query.toLowerCase();
    return (b.titulo.toLowerCase().includes(q)||b.autor.toLowerCase().includes(q)||(b.isbn||"").includes(q))
      &&(catF==="Todas"||b.categoria===catF)&&(estF==="Todos"||b.estado===estF);
  }),[books,query,catF,estF]);
  return(
    <div style={{padding:24,maxWidth:1100}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:12,marginBottom:20}}>
        <KpiCard label="Total"     value={books.length} accent="#003366"/>
        <KpiCard label="Disponibles" value={books.filter(b=>b.estado==="disponible").length} accent="#16A34A"/>
        <KpiCard label="Prestados"   value={books.filter(b=>b.estado==="prestado").length}   accent="#DC2626"/>
        <KpiCard label="Stock total" value={books.reduce((a,b)=>a+b.stock,0)} accent="#7C3AED" sub="ejemplares"/>
      </div>
      <div style={{display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:10,marginBottom:14}}>
        <CatalogFilters query={query} setQuery={setQuery} catFilter={catF} setCatFilter={setCatF} estadoFilter={estF} setEstadoFilter={setEstF}/>
        <button onClick={()=>setModal("new")} style={{display:"flex",alignItems:"center",gap:6,padding:"8px 16px",background:"#003366",color:"#fff",border:"none",borderRadius:8,fontWeight:500,fontSize:13,cursor:"pointer",height:38}}>
          <Plus size={15}/> Registrar libro
        </button>
      </div>
      <Card>
        <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
          <thead><tr style={{background:"#F8FAFC",borderBottom:"0.5px solid #E2E8F0"}}>
            {["Portada","Título / Autor","Categoría","Estado","Stock","Acciones"].map(h=>(
              <th key={h} style={{padding:"10px 14px",textAlign:"left",color:"#64748B",fontWeight:500,whiteSpace:"nowrap"}}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {filtered.map(book=>(
              <tr key={book.id} style={{borderBottom:"0.5px solid #F1F5F9"}}>
                <td style={{padding:"10px 14px"}}><img src={book.portada} alt="" style={{width:36,height:46,objectFit:"cover",borderRadius:4,background:"#EEF2FF"}} onError={e=>{e.currentTarget.style.background="#EEF2FF";e.currentTarget.src="";}}/>
                </td>
                <td style={{padding:"10px 14px",maxWidth:200}}>
                  <p style={{margin:0,fontWeight:500,color:"#1E293B"}}>{book.titulo}</p>
                  <p style={{margin:0,color:"#94A3B8",fontSize:12}}>{book.autor}</p>
                </td>
                <td style={{padding:"10px 14px",color:"#64748B",fontSize:12}}>{book.categoria}</td>
                <td style={{padding:"10px 14px"}}><Badge estado={book.estado}/></td>
                <td style={{padding:"10px 14px"}}><span style={{background:"#EFF6FF",color:"#003366",fontWeight:600,fontSize:13,padding:"3px 10px",borderRadius:8}}>{book.stock}</span></td>
                <td style={{padding:"10px 14px"}}>
                  <div style={{display:"flex",gap:5}}>
                    <IconBtn icon={Package} color="#7C3AED" bg="#F3E8FF" title="Gestionar stock" onClick={()=>setStockM(book)}/>
                    <IconBtn icon={Pencil}  color="#1D4ED8" bg="#EFF6FF" title="Editar"          onClick={()=>setModal(book)}/>
                    <IconBtn icon={Trash2}  color="#DC2626" bg="#FEF2F2" title="Eliminar"        onClick={()=>setDelB(book.id)}/>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length===0&&<tr><td colSpan={6} style={{padding:24,textAlign:"center",color:"#94A3B8"}}>Sin resultados</td></tr>}
          </tbody>
        </table>
        </div>
      </Card>
      {modal!==null&&<BookModal initial={modal==="new"?null:modal} onClose={()=>setModal(null)} onSave={modal==="new"?addBook:updateBook}/>}
      {stockM&&<StockModal book={stockM} onClose={()=>setStockM(null)} onUpdate={updateStock}/>}
      {delB&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:300}}>
          <div style={{background:"#fff",borderRadius:14,padding:28,maxWidth:340,width:"100%",margin:16}}>
            <h2 style={{margin:"0 0 8px",fontSize:16,fontWeight:500,color:"#1E293B"}}>¿Eliminar este libro?</h2>
            <p style={{margin:"0 0 20px",fontSize:13,color:"#64748B"}}>Esta acción es permanente.</p>
            <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
              <button onClick={()=>setDelB(null)} style={{padding:"8px 18px",borderRadius:8,border:"0.5px solid #E2E8F0",background:"#fff",color:"#475569",cursor:"pointer",fontSize:13}}>Cancelar</button>
              <button onClick={()=>{deleteBook(delB);setDelB(null);}} style={{padding:"8px 18px",borderRadius:8,border:"none",background:"#DC2626",color:"#fff",cursor:"pointer",fontSize:13,fontWeight:500}}>Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PrestamosView(){
  const isMobile=useIsMobile();
  const {books,users,prestamos,registrarPrestamo,registrarDevolucion,params,addToast,aprobarRenovacion,rechazarRenovacion}=useApp();
  const [tab,setTab]=useState("activos");
  const [selUser,setSelUser]=useState("");
  const [selBook,setSelBook]=useState("");
  const [pendingNew,setPendingNew]=useState(null);
  const [pendingDev,setPendingDev]=useState(null);
  const [busq,setBusq]=useState("");
  const [filtroEstado,setFiltroEstado]=useState("todos");

  const usuariosHabil=users.filter(u=>u.rol==="Usuario"&&u.estado==="activo");
  const librosDisp=books.filter(b=>b.stock>0&&b.estado==="disponible");
  const selBookObj=books.find(b=>b.id===+selBook);

  const activosRaw=prestamos.filter(p=>p.activo).map(p=>({...p,book:books.find(b=>b.id===p.bookId),user:users.find(u=>u.usuario===p.userId)}));
  const activosFiltrados=activosRaw.filter(p=>{
    const q=busq.toLowerCase();
    const matchQ=!q||p.book?.titulo.toLowerCase().includes(q)||p.user?.nombre.toLowerCase().includes(q);
    const v=isOver(p.fechaDevolucion);
    const matchE=filtroEstado==="todos"||(filtroEstado==="mora"&&v)||(filtroEstado==="ok"&&!v);
    return matchQ&&matchE;
  }).sort((a,b)=>{const av=isOver(a.fechaDevolucion)?1:0,bv=isOver(b.fechaDevolucion)?1:0;return bv-av||parseCL(a.fechaDevolucion).getTime()-parseCL(b.fechaDevolucion).getTime();});

  const totalActivos=activosRaw.length;
  const totalMora=activosRaw.filter(p=>isOver(p.fechaDevolucion)).length;
  const totalOk=totalActivos-totalMora;

  const ejecutarDevolucion=(prestamo)=>{
    const vencido=isOver(prestamo.fechaDevolucion);
    const diasMora=vencido?Math.abs(daysLeft(prestamo.fechaDevolucion)):0;
    const multa=diasMora*params.multaPorDia;
    registrarDevolucion(prestamo.id);
    if(vencido) addToast(`⚠ Devolución con atraso. Multa: $${multa.toLocaleString("es-CL")} CLP (${diasMora}d).`,"warning");
    else addToast(`✓ "${prestamo.book?.titulo}" devuelto a tiempo.`,"success");
    setPendingDev(null);
  };

  const solicitudesRenovacion=prestamos.filter(p=>p.activo&&p.renewalStatus==="pending")
    .map(p=>({...p,book:books.find(b=>b.id===p.bookId),user:users.find(u=>u.usuario===p.userId)}));

  return(
    <div style={{padding:24,maxWidth:1060}}>
      <SectionTitle icon={BookCopy} label="Gestión de préstamos y devoluciones"/>
      <div style={{display:"flex",gap:0,marginBottom:20,background:"#F8FAFC",borderRadius:10,border:"0.5px solid #E2E8F0",width:"fit-content",overflow:"hidden"}}>
        {[["activos","Préstamos activos"],["nuevo","Nuevo préstamo"]].map(([id,label])=>(
          <button key={id} onClick={()=>setTab(id)} style={{padding:"8px 22px",border:"none",fontSize:13,cursor:"pointer",background:tab===id?"#003366":"transparent",color:tab===id?"#fff":"#64748B",fontWeight:tab===id?500:400}}>
            {label}{id==="activos"&&totalMora>0&&<span style={{marginLeft:8,background:"#EF4444",color:"#fff",fontSize:10,padding:"1px 6px",borderRadius:99}}>{totalMora}</span>}
          </button>
        ))}
      </div>

      {tab==="activos"&&(
        <>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(100px,1fr))",gap:12,marginBottom:18,maxWidth:480}}>
            {[["Activos",totalActivos,"#003366"],["A tiempo",totalOk,"#16A34A"],["En mora",totalMora,"#DC2626"]].map(([l,v,a])=>(
              <div key={l} style={{background:"#fff",borderRadius:10,border:"0.5px solid #E2E8F0",padding:"10px 14px",borderTop:`3px solid ${a}`}}>
                <p style={{margin:"0 0 2px",fontSize:10,color:"#94A3B8",textTransform:"uppercase",letterSpacing:0.5}}>{l}</p>
                <p style={{margin:0,fontSize:22,fontWeight:500,color:"#1E293B"}}>{v}</p>
              </div>
            ))}
          </div>
          <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap"}}>
            <div style={{position:"relative",flex:"1 1 200px",maxWidth:320}}>
              <Search size={14} style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:"#94A3B8"}}/>
              <input value={busq} onChange={e=>setBusq(e.target.value)} placeholder="Buscar usuario o libro..." style={{paddingLeft:32,width:"100%",boxSizing:"border-box"}}/>
            </div>
            <div style={{display:"flex",gap:0,background:"#F8FAFC",borderRadius:8,border:"0.5px solid #E2E8F0",overflow:"hidden"}}>
              {[["todos","Todos"],["ok","A tiempo"],["mora","En mora"]].map(([v,l])=>(
                <button key={v} onClick={()=>setFiltroEstado(v)} style={{padding:"7px 14px",border:"none",fontSize:12,cursor:"pointer",fontWeight:filtroEstado===v?500:400,background:filtroEstado===v?(v==="mora"?"#FEF2F2":v==="ok"?"#F0FDF4":"#EFF6FF"):"transparent",color:filtroEstado===v?(v==="mora"?"#DC2626":v==="ok"?"#16A34A":"#003366"):"#64748B"}}>{l}</button>
              ))}
            </div>
          </div>
          <Card>
            <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
              <thead><tr style={{background:"#F8FAFC",borderBottom:"0.5px solid #E2E8F0"}}>
                {["Usuario","Libro","Fecha préstamo","Vencimiento","Estado","Acción"].map(h=>(
                  <th key={h} style={{padding:"10px 14px",textAlign:"left",color:"#64748B",fontWeight:500,whiteSpace:"nowrap"}}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {activosFiltrados.length===0&&(
                  <tr><td colSpan={6} style={{padding:32,textAlign:"center"}}>
                    <CheckCircle size={28} color="#BBF7D0" style={{display:"block",margin:"0 auto 8px"}}/>
                    <p style={{margin:0,color:"#94A3B8",fontSize:13}}>Sin resultados.</p>
                  </td></tr>
                )}
                {activosFiltrados.map(p=>{
                  const vencido=isOver(p.fechaDevolucion);const dl=daysLeft(p.fechaDevolucion);const urgente=!vencido&&dl<=2;
                  return(
                    <tr key={p.id} style={{borderBottom:"0.5px solid #F1F5F9",background:vencido?"#FFF5F5":urgente?"#FFFBEB":"#fff"}}>
                      <td style={{padding:"11px 14px"}}>
                        <div style={{display:"flex",alignItems:"center",gap:9}}>
                          <div style={{width:30,height:30,borderRadius:"50%",background:"#EFF6FF",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                            <span style={{fontSize:10,fontWeight:700,color:"#003366"}}>{p.user?.nombre.split(" ").map(n=>n[0]).join("").slice(0,2)}</span>
                          </div>
                          <div>
                            <p style={{margin:0,fontWeight:500,color:"#1E293B",fontSize:13}}>{p.user?.nombre||p.userId}</p>
                            <p style={{margin:0,fontSize:11,color:"#94A3B8"}}>@{p.userId}</p>
                          </div>
                        </div>
                      </td>
                      <td style={{padding:"11px 14px",maxWidth:180}}>
                        <div style={{display:"flex",alignItems:"center",gap:9}}>
                          <img src={p.book?.portada} alt="" style={{width:28,height:36,objectFit:"cover",borderRadius:3,background:"#EEF2FF",flexShrink:0}} onError={e=>{e.currentTarget.style.background="#EEF2FF";e.currentTarget.src="";}}/>
                          <p style={{margin:0,fontWeight:500,color:"#1E293B",fontSize:13,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:130}}>{p.book?.titulo||"—"}</p>
                        </div>
                      </td>
                      <td style={{padding:"11px 14px",color:"#64748B",fontSize:12,whiteSpace:"nowrap"}}>{p.fechaInicio}</td>
                      <td style={{padding:"11px 14px",whiteSpace:"nowrap"}}>
                        <span style={{color:vencido?"#DC2626":urgente?"#D97706":"#475569",fontWeight:vencido||urgente?600:400,fontSize:12}}>{p.fechaDevolucion}</span>
                        {vencido&&<p style={{margin:"2px 0 0",fontSize:11,color:"#DC2626"}}>{Math.abs(dl)}d mora</p>}
                        {urgente&&<p style={{margin:"2px 0 0",fontSize:11,color:"#D97706"}}>Vence en {dl}d</p>}
                      </td>
                      <td style={{padding:"11px 14px"}}>
                        {vencido?<Badge estado="mora"/>:urgente?<Badge estado="activo" custom="Vence pronto"/>:<Badge estado="activo"/>}
                        {p.renewalStatus==="pending"&&<p style={{margin:"3px 0 0",fontSize:10,color:"#D97706"}}>⏳ Renovación pendiente</p>}
                      </td>
                      <td style={{padding:"11px 14px"}}>
                        <button onClick={()=>setPendingDev(p)} style={{display:"flex",alignItems:"center",gap:6,padding:"7px 13px",borderRadius:8,border:"none",background:vencido?"#DC2626":"#16A34A",color:"#fff",fontSize:12,fontWeight:500,cursor:"pointer",whiteSpace:"nowrap"}}>
                          <RotateCcw size={13}/> Registrar devolución
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </Card>

          {/* Solicitudes de renovación */}
          {solicitudesRenovacion.length>0&&(
            <div style={{marginTop:28}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
                <RefreshCw size={16} color="#D97706"/>
                <h3 style={{margin:0,fontSize:15,fontWeight:500,color:"#1E293B"}}>Solicitudes de renovación</h3>
                <span style={{background:"#FEF3C7",color:"#92400E",fontSize:11,fontWeight:600,padding:"2px 8px",borderRadius:99}}>{solicitudesRenovacion.length} pendiente{solicitudesRenovacion.length!==1?"s":""}</span>
              </div>
              <Card>
                <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                  <thead><tr style={{background:"#FFFBEB",borderBottom:"0.5px solid #FDE68A"}}>
                    {["Usuario","Libro","Vencimiento actual","Acciones"].map(h=>(
                      <th key={h} style={{padding:"9px 14px",textAlign:"left",color:"#92400E",fontWeight:500}}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {solicitudesRenovacion.map(p=>(
                      <tr key={p.id} style={{borderBottom:"0.5px solid #F1F5F9"}}>
                        <td style={{padding:"10px 14px"}}>
                          <div style={{display:"flex",alignItems:"center",gap:8}}>
                            <div style={{width:28,height:28,borderRadius:"50%",background:"#EFF6FF",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                              <span style={{fontSize:10,fontWeight:700,color:"#003366"}}>{p.user?.nombre.split(" ").map(n=>n[0]).join("").slice(0,2)}</span>
                            </div>
                            <span style={{fontWeight:500,color:"#1E293B"}}>{p.user?.nombre||p.userId}</span>
                          </div>
                        </td>
                        <td style={{padding:"10px 14px",color:"#475569"}}>{p.book?.titulo||"—"}</td>
                        <td style={{padding:"10px 14px"}}>
                          <span style={{color:isOver(p.fechaDevolucion)?"#DC2626":"#475569",fontWeight:500,fontSize:12}}>{p.fechaDevolucion}</span>
                          {isOver(p.fechaDevolucion)&&<p style={{margin:"2px 0 0",fontSize:11,color:"#DC2626"}}>Ya vencido</p>}
                        </td>
                        <td style={{padding:"10px 14px"}}>
                          <div style={{display:"flex",gap:6}}>
                            <button onClick={()=>aprobarRenovacion(p.id)} style={{display:"flex",alignItems:"center",gap:5,padding:"6px 12px",borderRadius:7,border:"none",background:"#16A34A",color:"#fff",fontSize:12,fontWeight:500,cursor:"pointer"}}>
                              <CheckCircle size={12}/> Aprobar
                            </button>
                            <button onClick={()=>rechazarRenovacion(p.id)} style={{display:"flex",alignItems:"center",gap:5,padding:"6px 12px",borderRadius:7,border:"none",background:"#DC2626",color:"#fff",fontSize:12,fontWeight:500,cursor:"pointer"}}>
                              <X size={12}/> Rechazar
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </Card>
            </div>
          )}
        </>
      )}

      {tab==="nuevo"&&(
        <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:20}}>
          <Card style={{overflow:"visible"}}>
            <div style={{padding:"18px 20px",display:"flex",flexDirection:"column",gap:14}}>
              <h3 style={{margin:0,fontSize:14,fontWeight:500,color:"#1E293B"}}>Registrar nuevo préstamo</h3>
              <div style={{display:"flex",flexDirection:"column",gap:4}}>
                <label style={{fontSize:12,color:"#64748B",fontWeight:500}}>Usuario</label>
                <select value={selUser} onChange={e=>setSelUser(e.target.value)} style={{width:"100%",boxSizing:"border-box"}}>
                  <option value="">— Seleccionar usuario —</option>
                  {usuariosHabil.map(u=><option key={u.id} value={u.usuario}>{u.nombre}</option>)}
                </select>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:4}}>
                <label style={{fontSize:12,color:"#64748B",fontWeight:500}}>Libro</label>
                <select value={selBook} onChange={e=>setSelBook(e.target.value)} style={{width:"100%",boxSizing:"border-box"}}>
                  <option value="">— Seleccionar libro —</option>
                  {librosDisp.map(b=><option key={b.id} value={b.id}>{b.titulo} — stock: {b.stock}</option>)}
                </select>
              </div>
              {selUser&&selBook&&selBookObj&&(
                <div style={{background:"#F0FDF4",border:"0.5px solid #BBF7D0",borderRadius:8,padding:"10px 14px"}}>
                  <p style={{margin:0,fontSize:13,color:"#166534"}}>📅 Devolución: <strong>{addDays(params.diasPrestamo)}</strong></p>
                </div>
              )}
              <button disabled={!selUser||!selBook} onClick={()=>{if(selBookObj)setPendingNew({book:selBookObj,userId:selUser});}}
                style={{padding:"10px 0",borderRadius:8,border:"none",background:(!selUser||!selBook)?"#E2E8F0":"#003366",color:(!selUser||!selBook)?"#94A3B8":"#fff",cursor:(!selUser||!selBook)?"default":"pointer",fontWeight:500,fontSize:13}}>
                Registrar préstamo
              </button>
            </div>
          </Card>
          <Card>
            <div style={{padding:"18px 20px"}}>
              <h3 style={{margin:"0 0 14px",fontSize:14,fontWeight:500,color:"#1E293B"}}>Estado actual</h3>
              {[["Préstamos activos",totalActivos,"#1E293B"],["Vencidos",totalMora,"#DC2626"],["A tiempo",totalOk,"#16A34A"],["Días por préstamo",params.diasPrestamo+"d","#003366"],["Límite por usuario",params.limiteLibros+" libros","#7C3AED"]].map(([l,v,c])=>(
                <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"9px 0",borderBottom:"0.5px solid #F1F5F9"}}>
                  <span style={{fontSize:13,color:"#475569"}}>{l}</span>
                  <span style={{fontSize:13,fontWeight:500,color:String(c)}}>{v}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {pendingNew&&<ConfirmPrestamoModal book={pendingNew.book} fechaDev={addDays(params.diasPrestamo)}
        onConfirm={()=>{const ok=registrarPrestamo(pendingNew.book.id,pendingNew.userId);if(ok){setSelUser("");setSelBook("");}setPendingNew(null);}}
        onCancel={()=>setPendingNew(null)}/>}
      {pendingDev&&<ConfirmDevolucionModal prestamo={pendingDev} onConfirm={()=>ejecutarDevolucion(pendingDev)} onCancel={()=>setPendingDev(null)}/>}
    </div>
  );
}

function NotifCenterView(){
  const {sysNotifs,enviarNotificacion}=useApp();
  const [sent,setSent]=useState(new Set());
  return(
    <div style={{padding:24,maxWidth:860}}>
      <SectionTitle icon={MessageSquare} label="Centro de notificaciones" count={sysNotifs.length}/>
      {sysNotifs.length===0?(
        <div style={{textAlign:"center",padding:"48px 0"}}>
          <CheckCircle size={40} color="#BBF7D0" style={{margin:"0 auto 12px"}}/>
          <p style={{fontSize:15,fontWeight:500,color:"#94A3B8",margin:"0 0 4px"}}>Todo en orden</p>
          <p style={{fontSize:13,color:"#CBD5E1",margin:0}}>No hay alertas activas.</p>
        </div>
      ):(
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {sysNotifs.map(n=>{
            const yaEnviado=sent.has(n.id);
            return(
              <div key={n.id} style={{background:"#fff",borderRadius:12,border:`1px solid ${n.type==="danger"?"#FECACA":"#FDE68A"}`,padding:"14px 18px",display:"flex",alignItems:"center",gap:16}}>
                <div style={{width:40,height:40,borderRadius:"50%",background:n.type==="danger"?"#FEF2F2":"#FFFBEB",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  {n.type==="danger"?<AlertCircle size={18} color="#DC2626"/>:<AlertTriangle size={18} color="#D97706"/>}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <p style={{margin:"0 0 4px",fontSize:13,fontWeight:500,color:"#1E293B",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{n.msg}</p>
                  <span style={{fontSize:11,color:"#94A3B8"}}>Usuario: {n.userName}</span>
                </div>
                <button onClick={()=>{
                  const msg=n.type==="danger"?`⚠️ Tu préstamo de "${n.bookTitle}" está vencido.`:`📅 Tu préstamo de "${n.bookTitle}" vence pronto.`;
                  enviarNotificacion(n.userId,n.userName,msg,n.bookTitle);
                  setSent(p=>new Set([...p,n.id]));
                }} disabled={yaEnviado} style={{display:"flex",alignItems:"center",gap:6,padding:"8px 14px",borderRadius:8,border:"none",background:yaEnviado?"#F1F5F9":"#003366",color:yaEnviado?"#94A3B8":"#fff",cursor:yaEnviado?"default":"pointer",fontSize:12,fontWeight:500,flexShrink:0}}>
                  <Send size={13}/>{yaEnviado?"Enviado":"Notificar"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ReportesView(){
  const isMobile=useIsMobile();
  const {books,users,prestamos,sysNotifs}=useApp();
  const activos=prestamos.filter(p=>p.activo);
  const enMora=activos.filter(p=>isOver(p.fechaDevolucion));
  const topLibros=[...books].sort((a,b)=>(b.prestamos||0)-(a.prestamos||0)).slice(0,3);
  const barMax=topLibros[0]?.prestamos||1;
  const activPorUser=users.map(u=>({...u,total:prestamos.filter(p=>p.userId===u.usuario).length})).filter(u=>u.total>0).sort((a,b)=>b.total-a.total).slice(0,5);
  return(
    <div style={{padding:24,maxWidth:1000}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:14,marginBottom:24}}>
        <KpiCard label="Préstamos activos" value={activos.length}   accent="#003366" icon={BookOpen}/>
        <KpiCard label="En mora"           value={enMora.length}   accent="#DC2626" icon={AlertCircle}/>
        <KpiCard label="Alertas sistema"   value={sysNotifs.length}accent="#D97706" icon={Bell}/>
        <KpiCard label="Usuarios"          value={users.length}    accent="#7C3AED" icon={Users}/>
        <KpiCard label="Catálogo"          value={books.length}    accent="#16A34A" icon={BookMarked}/>
      </div>
      <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:20}}>
        <Card>
          <div style={{padding:"14px 18px",borderBottom:"0.5px solid #F1F5F9",display:"flex",alignItems:"center",gap:8}}>
            <TrendingUp size={16} color="#003366"/><h3 style={{margin:0,fontSize:14,fontWeight:500,color:"#1E293B"}}>Top 3 más prestados</h3>
          </div>
          <div style={{padding:"12px 18px",display:"flex",flexDirection:"column",gap:14}}>
            {topLibros.length===0&&<p style={{fontSize:13,color:"#94A3B8",margin:0}}>Sin datos aún.</p>}
            {topLibros.map((b,i)=>(
              <div key={b.id}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{width:20,height:20,borderRadius:"50%",background:["#F5A623","#CBD5E1","#CD7F32"][i],display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,color:"#fff",flexShrink:0}}>{i+1}</span>
                    <p style={{margin:0,fontSize:13,fontWeight:500,color:"#1E293B"}}>{b.titulo}</p>
                  </div>
                  <span style={{fontSize:12,color:"#94A3B8"}}>{b.prestamos||0}</span>
                </div>
                <div style={{background:"#F1F5F9",borderRadius:99,height:6,overflow:"hidden"}}>
                  <div style={{height:"100%",borderRadius:99,background:["#003366","#64748B","#94A3B8"][i],width:`${((b.prestamos||0)/barMax)*100}%`}}/>
                </div>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <div style={{padding:"14px 18px",borderBottom:"0.5px solid #F1F5F9",display:"flex",alignItems:"center",gap:8}}>
            <BarChart3 size={16} color="#003366"/><h3 style={{margin:0,fontSize:14,fontWeight:500,color:"#1E293B"}}>Usuarios más activos</h3>
          </div>
          <div style={{padding:"12px 18px",display:"flex",flexDirection:"column",gap:10}}>
            {activPorUser.length===0&&<p style={{fontSize:13,color:"#94A3B8",margin:0}}>Sin actividad.</p>}
            {activPorUser.map(u=>(
              <div key={u.id} style={{display:"flex",alignItems:"center",gap:10}}>
                <div style={{width:28,height:28,borderRadius:"50%",background:"#EFF6FF",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  <span style={{fontSize:11,fontWeight:600,color:"#003366"}}>{u.nombre.split(" ").map(n=>n[0]).join("").slice(0,2)}</span>
                </div>
                <div style={{flex:1}}><p style={{margin:0,fontSize:13,fontWeight:500,color:"#1E293B"}}>{u.nombre}</p><p style={{margin:0,fontSize:11,color:"#94A3B8"}}>{u.total} préstamo{u.total!==1?"s":""}</p></div>
                <Badge estado={u.rol}/>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ─── VIEWS: NIVEL 3 (Admin) ──────────────────────────────────
function UsuariosView(){
  const {users,addUser,updateUser,deleteUser,toggleUser}=useApp();
  const [modal,setModal]=useState(null);
  const [delTarget,setDelTarget]=useState(null);
  const [search,setSearch]=useState("");
  const filtered=users.filter(u=>u.nombre.toLowerCase().includes(search.toLowerCase())||u.usuario.toLowerCase().includes(search.toLowerCase()));
  return(
    <div style={{padding:24,maxWidth:960}}>
      <SectionTitle icon={Users} label="Gestión de usuarios" count={users.length}/>
      <div style={{display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:10,marginBottom:14}}>
        <div style={{position:"relative",flex:"1 1 200px",maxWidth:300}}>
          <Search size={14} style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:"#94A3B8"}}/>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar..." style={{paddingLeft:32,width:"100%",boxSizing:"border-box"}}/>
        </div>
        <button onClick={()=>setModal("new")} style={{display:"flex",alignItems:"center",gap:6,padding:"8px 16px",background:"#003366",color:"#fff",border:"none",borderRadius:8,fontWeight:500,fontSize:13,cursor:"pointer"}}>
          <Plus size={15}/> Nuevo usuario
        </button>
      </div>
      <Card>
        <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
          <thead><tr style={{background:"#F8FAFC",borderBottom:"0.5px solid #E2E8F0"}}>
            {["Nombre","Usuario","Rol","Estado","Acciones"].map(h=>(
              <th key={h} style={{padding:"10px 16px",textAlign:"left",color:"#64748B",fontWeight:500}}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {filtered.map(u=>(
              <tr key={u.id} style={{borderBottom:"0.5px solid #F1F5F9",opacity:u.estado==="suspendido"?0.65:1}}>
                <td style={{padding:"10px 16px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <div style={{width:32,height:32,borderRadius:"50%",background:u.isSeed?"#F3E8FF":"#EFF6FF",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                      <span style={{fontSize:12,fontWeight:700,color:u.isSeed?"#6B21A8":"#003366"}}>{u.nombre.split(" ").map(n=>n[0]).join("").slice(0,2)}</span>
                    </div>
                    <div>
                      <span style={{fontWeight:500,color:"#1E293B"}}>{u.nombre}</span>
                      {u.isSeed&&<span style={{marginLeft:8,fontSize:10,background:"#F3E8FF",color:"#6B21A8",padding:"1px 6px",borderRadius:99,fontWeight:500}}>Cuenta maestra</span>}
                    </div>
                  </div>
                </td>
                <td style={{padding:"10px 16px",color:"#64748B",fontFamily:"monospace",fontSize:12}}>{u.usuario}</td>
                <td style={{padding:"10px 16px"}}><Badge estado={u.rol}/></td>
                <td style={{padding:"10px 16px"}}><Badge estado={u.estado}/></td>
                <td style={{padding:"10px 16px"}}>
                  <div style={{display:"flex",gap:6,alignItems:"center"}}>
                    <IconBtn icon={Pencil} color="#1D4ED8" bg="#EFF6FF" title="Editar" onClick={()=>setModal(u)}/>
                    {!u.isSeed&&(
                      <button onClick={()=>toggleUser(u.id)} style={{background:u.estado==="activo"?"#FEF2F2":"#DCFCE7",border:"none",borderRadius:6,padding:"5px 9px",cursor:"pointer",fontSize:11,fontWeight:500,color:u.estado==="activo"?"#DC2626":"#16A34A"}}>
                        {u.estado==="activo"?"Desactivar":"Activar"}
                      </button>
                    )}
                    {!u.isSeed&&<IconBtn icon={Trash2} color="#DC2626" bg="#FEF2F2" title="Eliminar" onClick={()=>setDelTarget(u)}/>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </Card>
      {modal!==null&&<UserModal initial={modal==="new"?null:modal} onClose={()=>setModal(null)} onSave={modal==="new"?addUser:updateUser}/>}
      {delTarget&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:300,padding:16}}>
          <div style={{background:"#fff",borderRadius:14,padding:28,maxWidth:420,width:"100%",boxShadow:"0 20px 48px rgba(0,0,0,0.18)"}}>
            <div style={{display:"flex",alignItems:"flex-start",gap:14,marginBottom:18}}>
              <div style={{width:40,height:40,borderRadius:"50%",background:"#FEF2F2",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Trash2 size={18} color="#DC2626"/></div>
              <div>
                <h2 style={{margin:"0 0 6px",fontSize:16,fontWeight:500,color:"#1E293B"}}>Eliminar usuario permanentemente</h2>
                <p style={{margin:0,fontSize:13,color:"#64748B",lineHeight:1.55}}>¿Estás seguro de que deseas eliminar a <strong style={{color:"#1E293B"}}>{delTarget.nombre}</strong>? Esta acción <strong>no se puede deshacer</strong>.</p>
              </div>
            </div>
            <div style={{background:"#F8FAFC",borderRadius:8,padding:"10px 14px",marginBottom:20,display:"flex",gap:10,alignItems:"center"}}>
              <div style={{width:30,height:30,borderRadius:"50%",background:"#EFF6FF",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                <span style={{fontSize:11,fontWeight:700,color:"#003366"}}>{delTarget.nombre.split(" ").map(n=>n[0]).join("").slice(0,2)}</span>
              </div>
              <div>
                <p style={{margin:0,fontSize:13,fontWeight:500,color:"#1E293B"}}>{delTarget.nombre}</p>
                <p style={{margin:0,fontSize:11,color:"#94A3B8"}}>@{delTarget.usuario}</p>
              </div>
            </div>
            <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
              <button onClick={()=>setDelTarget(null)} style={{padding:"9px 20px",borderRadius:8,border:"0.5px solid #E2E8F0",background:"#fff",color:"#475569",cursor:"pointer",fontSize:13}}>Cancelar</button>
              <button onClick={()=>{deleteUser(delTarget.id);setDelTarget(null);}} style={{padding:"9px 22px",borderRadius:8,border:"none",background:"#DC2626",color:"#fff",cursor:"pointer",fontSize:13,fontWeight:500,display:"flex",alignItems:"center",gap:6}}>
                <Trash2 size={13}/> Eliminar permanentemente
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ParamsView(){
  const {params,updateParams,addToast}=useApp();
  const [form,setForm]=useState(params);
  const set=(k,v)=>setForm(p=>({...p,[k]:v}));
  return(
    <div style={{padding:24,maxWidth:580}}>
      <SectionTitle icon={Sliders} label="Parámetros del sistema"/>
      <div style={{background:"#FFFBEB",border:"0.5px solid #FDE68A",borderRadius:10,padding:"10px 14px",marginBottom:20,display:"flex",gap:8}}>
        <AlertTriangle size={15} color="#D97706" style={{flexShrink:0,marginTop:1}}/>
        <p style={{margin:0,fontSize:12,color:"#92400E"}}>Los cambios afectarán solo a operaciones nuevas.</p>
      </div>
      <Card style={{overflow:"visible"}}>
        <div style={{padding:"20px 24px",display:"flex",flexDirection:"column",gap:20}}>
          {[{key:"diasPrestamo",label:"Días máximos de préstamo",unit:"días"},{key:"limiteLibros",label:"Límite libros simultáneos",unit:"libros"},{key:"multaPorDia",label:"Multa por día de mora",unit:"CLP",step:100}].map(p=>(
            <div key={p.key}>
              <label style={{fontSize:13,fontWeight:500,color:"#1E293B",display:"block",marginBottom:6}}>{p.label}</label>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <input type="number" min="1" step={p.step||1} value={form[p.key]} onChange={e=>set(p.key,+e.target.value)} style={{width:120,boxSizing:"border-box",fontSize:16,textAlign:"center"}}/>
                <span style={{fontSize:13,color:"#64748B"}}>{p.unit}</span>
              </div>
            </div>
          ))}
        </div>
        <div style={{padding:"16px 24px",borderTop:"0.5px solid #E2E8F0",display:"flex",justifyContent:"flex-end"}}>
          <button onClick={()=>{updateParams(form);addToast("Parámetros guardados.","success");}} style={{padding:"9px 24px",borderRadius:8,border:"none",background:"#003366",color:"#fff",cursor:"pointer",fontSize:13,fontWeight:500}}>Guardar parámetros</button>
        </div>
      </Card>
    </div>
  );
}

function AuditoriaView(){
  const {auditLog}=useApp();
  return(
    <div style={{padding:24,maxWidth:960}}>
      <SectionTitle icon={ClipboardList} label="Log de auditoría" count={auditLog.length}/>
      <Card>
        <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
          <thead><tr style={{background:"#F8FAFC",borderBottom:"0.5px solid #E2E8F0"}}>
            {["Fecha","Usuario","Acción","Detalle"].map(h=>(
              <th key={h} style={{padding:"9px 14px",textAlign:"left",color:"#64748B",fontWeight:500}}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {auditLog.length===0&&<tr><td colSpan={4} style={{padding:20,textAlign:"center",color:"#94A3B8"}}>Sin registros.</td></tr>}
            {auditLog.map(l=>(
              <tr key={l.id} style={{borderBottom:"0.5px solid #F1F5F9"}}>
                <td style={{padding:"8px 14px",color:"#94A3B8",whiteSpace:"nowrap",fontSize:12}}>{l.fecha}</td>
                <td style={{padding:"8px 14px",color:"#1E293B",fontWeight:500}}>{l.usuario}</td>
                <td style={{padding:"8px 14px",color:"#475569"}}>{l.accion}</td>
                <td style={{padding:"8px 14px",color:"#64748B"}}>{l.detalle}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </Card>
    </div>
  );
}

// ─── LOGIN + REGISTRO ────────────────────────────────────────
function LoginPanelLeft(){
  return(
    <div style={{background:"rgba(0,0,0,0.22)",backdropFilter:"blur(8px)",padding:"48px 40px",display:"flex",flexDirection:"column",justifyContent:"space-between",borderRight:"1px solid rgba(255,255,255,0.08)"}}>
      <div>
        <DuocLogoSVG height={40}/>
        <div style={{width:52,height:3,background:"#F5A623",borderRadius:2,margin:"20px 0 22px"}}/>
        <h2 style={{margin:"0 0 12px",fontSize:22,fontWeight:400,color:"#fff",lineHeight:1.4}}>Sistema de Gestión<br/><strong>Bibliotecaria</strong></h2>
        <p style={{margin:0,fontSize:13,color:"rgba(255,255,255,0.55)",lineHeight:1.7}}>Escuela de Informática y<br/>Telecomunicaciones</p>
      </div>
      <div>
        <div style={{display:"flex",gap:10,marginTop:32}}>
          {[BookOpen,Users,BarChart3,Bell].map((Icon,i)=>(
            <div key={i} style={{width:40,height:40,borderRadius:10,background:"rgba(255,255,255,0.07)",display:"flex",alignItems:"center",justifyContent:"center"}}>
              <Icon size={18} color="rgba(255,255,255,0.45)"/>
            </div>
          ))}
        </div>
        <p style={{margin:"16px 0 0",fontSize:11,color:"rgba(255,255,255,0.28)"}}>SGBU v1.0 — Revisión 02 · 2026</p>
      </div>
    </div>
  );
}

function LoginForm(){
  const {login,users,selfRegister,addToast}=useApp();
  const isMobile=useIsMobile();
  const [mode,setMode]=useState("login");
  const [user,setUser]=useState("");const [pass,setPass]=useState("");const [error,setError]=useState("");
  const [rNombre,setRNombre]=useState("");const [rUsuario,setRUsuario]=useState("");
  const [rPass,setRPass]=useState("");const [rPass2,setRPass2]=useState("");
  const [rSubmit,setRSubmit]=useState("");

  const pwdErrors=validatePassword(rPass);
  const pwdStrength=Math.max(0,PWD_RULES.length-pwdErrors.length);
  const strengthColor=["#E2E8F0","#DC2626","#D97706","#16A34A"][pwdStrength];
  const strengthLabel=["","Débil","Regular","Fuerte"][pwdStrength];

  const handleLogin=()=>{
    const found=users.find(u=>u.usuario===user&&u.password===pass);
    if(found){if(found.estado==="suspendido"){setError("Esta cuenta se encuentra suspendida.");return;}login({nombre:found.nombre,rol:found.rol,userId:found.usuario});}
    else setError("Credenciales incorrectas. Por favor, intente nuevamente.");
  };
  const handleRegister=()=>{
    setRSubmit("");
    if(!rNombre.trim()||!rUsuario.trim()||!rPass){setRSubmit("Completa todos los campos.");return;}
    if(pwdErrors.length) return;
    if(rPass!==rPass2){setRSubmit("Las contraseñas no coinciden.");return;}
    const err=selfRegister({nombre:rNombre.trim(),usuario:rUsuario.trim(),password:rPass});
    if(err){setRSubmit(err);return;}
    addToast("Cuenta creada. Ya puedes iniciar sesión.","success");
    setUser(rUsuario.trim());setPass("");setMode("login");
    setRNombre("");setRUsuario("");setRPass("");setRPass2("");
  };

  return(
    <div style={{minHeight:"calc(100vh - 56px)",background:"linear-gradient(135deg,#001d3d 0%,#003366 60%,#0055a4 100%)",display:"flex",alignItems:"center",justifyContent:"center",padding:isMobile?16:24}}>
      <div style={{width:"100%",maxWidth:isMobile?480:860,display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:0,borderRadius:isMobile?14:18,overflow:"hidden",boxShadow:"0 24px 60px rgba(0,0,0,0.35)"}}>
        {!isMobile&&<LoginPanelLeft/>}
        <div style={{background:"#fff",padding:isMobile?"28px 24px":"40px 38px",display:"flex",flexDirection:"column",justifyContent:"center"}}>
          {mode==="login"&&(
            <>
              <h1 style={{margin:"0 0 5px",fontSize:20,fontWeight:500,color:"#1E293B"}}>Iniciar sesión</h1>
              <p style={{margin:"0 0 26px",fontSize:13,color:"#94A3B8"}}>Ingresa tus credenciales institucionales.</p>
              <div style={{display:"flex",flexDirection:"column",gap:15}}>
                <div>
                  <label style={{fontSize:13,color:"#475569",display:"block",marginBottom:5,fontWeight:500}}>Usuario</label>
                  <input value={user} onChange={e=>{setUser(e.target.value);setError("");}} placeholder="Nombre de usuario" onKeyDown={e=>e.key==="Enter"&&handleLogin()} style={{width:"100%",boxSizing:"border-box"}}/>
                </div>
                <div>
                  <label style={{fontSize:13,color:"#475569",display:"block",marginBottom:5,fontWeight:500}}>Contraseña</label>
                  <input type="password" value={pass} onChange={e=>{setPass(e.target.value);setError("");}} placeholder="••••••••" onKeyDown={e=>e.key==="Enter"&&handleLogin()} style={{width:"100%",boxSizing:"border-box"}}/>
                </div>
                {error&&<div style={{display:"flex",alignItems:"center",gap:8,background:"#FEF2F2",border:"0.5px solid #FECACA",borderRadius:8,padding:"10px 12px"}}><AlertCircle size={14} color="#DC2626" style={{flexShrink:0}}/><p style={{margin:0,fontSize:12,color:"#DC2626"}}>{error}</p></div>}
                <button onClick={handleLogin} style={{padding:"11px 0",borderRadius:8,background:"#003366",color:"#fff",border:"none",fontWeight:500,fontSize:14,cursor:"pointer"}}>Ingresar</button>
              </div>
              <p style={{margin:"22px 0 0",fontSize:13,color:"#94A3B8",textAlign:"center"}}>¿No tienes cuenta?{" "}<button onClick={()=>{setMode("register");setError("");}} style={{background:"none",border:"none",color:"#003366",fontWeight:500,fontSize:13,cursor:"pointer",padding:0,textDecoration:"underline"}}>Regístrate aquí</button></p>
              <p style={{margin:"14px 0 0",fontSize:11,color:"#CBD5E1",textAlign:"center"}}>Sistema restringido a personal y usuarios autorizados de DUOC UC.</p>
            </>
          )}
          {mode==="register"&&(
            <>
              <h1 style={{margin:"0 0 5px",fontSize:20,fontWeight:500,color:"#1E293B"}}>Crear cuenta</h1>
              <p style={{margin:"0 0 22px",fontSize:13,color:"#94A3B8"}}>Tu cuenta tendrá acceso de Usuario al sistema.</p>
              <div style={{display:"flex",flexDirection:"column",gap:13}}>
                <div>
                  <label style={{fontSize:13,color:"#475569",display:"block",marginBottom:5,fontWeight:500}}>Nombre completo *</label>
                  <input value={rNombre} onChange={e=>setRNombre(e.target.value)} placeholder="Ej: Ana Torres" style={{width:"100%",boxSizing:"border-box"}}/>
                </div>
                <div>
                  <label style={{fontSize:13,color:"#475569",display:"block",marginBottom:5,fontWeight:500}}>Usuario *</label>
                  <input value={rUsuario} onChange={e=>setRUsuario(e.target.value.toLowerCase().replace(/\s/g,""))} placeholder="Ej: ana.torres" style={{width:"100%",boxSizing:"border-box"}}/>
                  <p style={{margin:"4px 0 0",fontSize:11,color:"#94A3B8"}}>Solo letras, números y puntos. Sin espacios.</p>
                </div>
                <div>
                  <label style={{fontSize:13,color:"#475569",display:"block",marginBottom:5,fontWeight:500}}>Contraseña *</label>
                  <input type="password" value={rPass} onChange={e=>setRPass(e.target.value)} placeholder="Mínimo 8 chars, 1 mayúscula, 1 número" style={{width:"100%",boxSizing:"border-box",borderColor:rPass&&pwdErrors.length?"#FECACA":"#E2E8F0"}}/>
                  {rPass&&(
                    <div style={{marginTop:6}}>
                      <div style={{display:"flex",gap:4,marginBottom:4}}>{[1,2,3].map(i=><div key={i} style={{flex:1,height:3,borderRadius:99,background:i<=pwdStrength?strengthColor:"#E2E8F0",transition:"background .2s"}}/>)}</div>
                      <p style={{margin:0,fontSize:11,color:strengthColor,fontWeight:500}}>{strengthLabel}</p>
                    </div>
                  )}
                  {rPass&&pwdErrors.length>0&&(
                    <div style={{marginTop:6,display:"flex",flexDirection:"column",gap:3}}>
                      {PWD_RULES.map(r=>{const ok=r.test(rPass);return(
                        <div key={r.msg} style={{display:"flex",alignItems:"center",gap:5}}>
                          <div style={{width:12,height:12,borderRadius:"50%",background:ok?"#16A34A":"#E2E8F0",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{ok&&<CheckCircle size={10} color="#fff"/>}</div>
                          <span style={{fontSize:11,color:ok?"#16A34A":"#94A3B8"}}>{r.msg}</span>
                        </div>
                      );})}
                    </div>
                  )}
                </div>
                <div>
                  <label style={{fontSize:13,color:"#475569",display:"block",marginBottom:5,fontWeight:500}}>Confirmar contraseña *</label>
                  <input type="password" value={rPass2} onChange={e=>setRPass2(e.target.value)} placeholder="Repite tu contraseña" style={{width:"100%",boxSizing:"border-box",borderColor:rPass2&&rPass!==rPass2?"#FECACA":"#E2E8F0"}}/>
                  {rPass2&&rPass!==rPass2&&<p style={{margin:"4px 0 0",fontSize:11,color:"#DC2626"}}>Las contraseñas no coinciden.</p>}
                </div>
                {rSubmit&&<div style={{display:"flex",alignItems:"center",gap:8,background:"#FEF2F2",border:"0.5px solid #FECACA",borderRadius:8,padding:"10px 12px"}}><AlertCircle size={14} color="#DC2626" style={{flexShrink:0}}/><p style={{margin:0,fontSize:12,color:"#DC2626"}}>{rSubmit}</p></div>}
                <button onClick={handleRegister} style={{padding:"11px 0",borderRadius:8,background:"#003366",color:"#fff",border:"none",fontWeight:500,fontSize:14,cursor:"pointer",marginTop:2}}>Crear cuenta</button>
              </div>
              <p style={{margin:"18px 0 0",fontSize:13,color:"#94A3B8",textAlign:"center"}}>¿Ya tienes cuenta?{" "}<button onClick={()=>{setMode("login");setRSubmit("");}} style={{background:"none",border:"none",color:"#003366",fontWeight:500,fontSize:13,cursor:"pointer",padding:0,textDecoration:"underline"}}>Inicia sesión</button></p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── MAIN LAYOUT ─────────────────────────────────────────────
const SECTION_LABELS = {
  catalogo:"Catálogo",misprestamos:"Mis Préstamos",
  inventario:"Inventario",prestamos:"Préstamos",
  notificaciones:"Notificaciones",reportes:"Reportes",
  usuarios:"Usuarios",params:"Configuración",auditoria:"Auditoría",
};

function MainLayout({sidebarOpen=false,setSidebarOpen=(_v?: boolean)=>{}}){
  const {session,effectiveRole,misActivos,sysNotifs,misNotificaciones}=useApp();
  const defaultTab=useMemo(()=>{
    if(hasLevel(effectiveRole,"Admin")) return "reportes";
    if(hasLevel(effectiveRole,"Bibliotecario")) return "inventario";
    return "catalogo";
  },[effectiveRole]);
  const [activeTab,setActiveTab]=useState(defaultTab);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(()=>setActiveTab(defaultTab),[effectiveRole,defaultTab]);

  const userId=session.userId;
  const activos=misActivos(userId);
  const personal=misNotificaciones(userId).length;
  const enMora=activos.filter(p=>isOver(p.fechaDevolucion)).length;
  const badge={notificaciones:sysNotifs.length,misprestamos:activos.length};

  return(
    <div style={{display:"flex"}}>
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} badge={badge} open={sidebarOpen} onClose={()=>setSidebarOpen(false)}/>
      <main style={{flex:1,background:"#F8FAFC",minHeight:"calc(100vh - 56px)",minWidth:0}}>
        <Breadcrumb section={SECTION_LABELS[activeTab]||activeTab}/>
        {personal>0&&(
          <div style={{margin:"10px 24px 0",display:"flex",alignItems:"center",gap:10,background:"#EFF6FF",border:"1px solid #BFDBFE",borderRadius:10,padding:"10px 14px"}}>
            <Bell size={15} color="#1D4ED8"/><p style={{margin:0,fontSize:13,color:"#1E40AF"}}>Tienes <strong>{personal}</strong> notificación{personal!==1?"es":""} sin leer.</p>
          </div>
        )}
        {enMora>0&&activeTab==="catalogo"&&(
          <div style={{margin:"8px 24px 0",display:"flex",alignItems:"center",gap:10,background:"#FEF2F2",border:"1px solid #FECACA",borderRadius:10,padding:"10px 14px"}}>
            <AlertCircle size={15} color="#DC2626"/><p style={{margin:0,fontSize:13,color:"#991B1B"}}>Tienes <strong>{enMora}</strong> préstamo{enMora!==1?"s":""} vencido{enMora!==1?"s":""}. <button onClick={()=>setActiveTab("misprestamos")} style={{background:"none",border:"none",color:"#003366",textDecoration:"underline",cursor:"pointer",fontSize:13,padding:0}}>Ver préstamos →</button></p>
          </div>
        )}
        {activeTab==="catalogo"     &&<CatalogoView userId={userId}/>}
        {activeTab==="misprestamos" &&<MisPrestamosView userId={userId}/>}
        {hasLevel(effectiveRole,"Bibliotecario")&&<>
          {activeTab==="inventario"     &&<InventarioView/>}
          {activeTab==="prestamos"      &&<PrestamosView/>}
          {activeTab==="notificaciones" &&<NotifCenterView/>}
          {activeTab==="reportes"       &&<ReportesView/>}
        </>}
        {hasLevel(effectiveRole,"Admin")&&<>
          {activeTab==="usuarios"  &&<UsuariosView/>}
          {activeTab==="params"    &&<ParamsView/>}
          {activeTab==="auditoria" &&<AuditoriaView/>}
        </>}
      </main>
    </div>
  );
}

// ─── APP ROOT ────────────────────────────────────────────────
function AppShell(){
  const {session}=useApp();
  const [sidebarOpen,setSidebarOpen]=useState(false);
  return(
    <div style={{fontFamily:"system-ui,sans-serif",minHeight:"100vh"}}>
      <Navbar onToggleSidebar={()=>setSidebarOpen(o=>!o)}/>
      <ToastContainer/>
      {!session?<LoginForm/>:<MainLayout sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen}/>}
    </div>
  );
}

export default function App(){
  return <AppProvider><AppShell/></AppProvider>;
}
