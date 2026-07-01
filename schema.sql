CREATE TABLE cursos (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    whatsapp_link TEXT
);

CREATE TABLE alumnos (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    clave VARCHAR(100) DEFAULT 'usuario',
    curso_id INT REFERENCES cursos(id) ON DELETE CASCADE,
    primer_ingreso BOOLEAN DEFAULT TRUE
);

CREATE TABLE banco_tareas (
    id SERIAL PRIMARY KEY,
    titulo VARCHAR(150) NOT NULL,
    tema VARCHAR(100) NOT NULL,
    archivo_url TEXT,
    enlace_externo TEXT,
    requiere_entrega BOOLEAN DEFAULT FALSE
);

CREATE TABLE tareas_asignadas (
    id SERIAL PRIMARY KEY,
    curso_id INT REFERENCES cursos(id) ON DELETE CASCADE,
    tarea_id INT REFERENCES banco_tareas(id) ON DELETE CASCADE,
    fecha_entrega DATE,
    prerequisito_tarea_id INT REFERENCES banco_tareas(id) ON DELETE SET NULL
);

CREATE TABLE adecuaciones (
    alumno_id INT REFERENCES alumnos(id) ON DELETE CASCADE,
    tarea_id INT REFERENCES banco_tareas(id) ON DELETE CASCADE,
    PRIMARY KEY (alumno_id, tarea_id)
);

CREATE TABLE entregas (
    id SERIAL PRIMARY KEY,
    alumno_id INT REFERENCES alumnos(id) ON DELETE CASCADE,
    tarea_id INT REFERENCES banco_tareas(id) ON DELETE CASCADE,
    archivo_entrega_url TEXT,
    visto BOOLEAN DEFAULT FALSE,
    corregido BOOLEAN DEFAULT FALSE,
    devolucion TEXT
);
