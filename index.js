const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const ejs = require('ejs');
const app = express();


const PORT = process.env.PORT || 3000;

// Set EJS as view engine
app.set('view engine', ejs);

app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(session({
  secret: 'your-secret-key',
  resave: true,
  saveUninitialized: true,
  cookie: { maxAge: 60000 },
}));

mongoose.connect("mongodb+srv://edai1grp4:X5skky73ua6wcCal@cluster0.xp6ghfb.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0", {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 3000,
});

const db = mongoose.connection;

db.on('error', (err) => {
  console.error('MongoDB connection error:', err);
});

db.once('open', () => {
  console.log('Connected to MongoDB');
});

db.on('disconnected', () => {
  console.log('MongoDB disconnected');
});

process.on('SIGINT', async () => {
  await mongoose.connection.close();
  process.exit(0);
});

const User = mongoose.model('User', {
  prn: String,
  name: String,
  email: String,
  password: String,
});


const Librarian = mongoose.model('Librarian', {
  email: {
    type: String,
    unique: true,
    required: true,
  },
  password: {
    type: String,
    required: true,
  },
});

// Book model (modify according to your actual model)
const Book = mongoose.model('Book', {
  title: String,
  author: String,
  isbn: String,
  librarian: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Librarian',
  },
});

// Middleware for Librarian Authentication
const requireLibrarianLogin = (req, res, next) => {
  if (req.session.librarianId) {
    next(); // Librarian is logged in, proceed to the next middleware
  } else {
    res.status(401).json({ error: 'Not authorized. Please log in as a librarian.' });
  }
};

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/welcome.html');
});

// User login
app.get('/login', (req, res) => {
  res.sendFile(__dirname + '/public/login.html');
});

app.post('/login', async (req, res) => {
  try {
    const { prn, password } = req.body;
    const user = await User.findOne({ prn });

    if (user && (await bcrypt.compare(password, user.password))) {
      req.session.userId = user._id;
      req.session.name = user.name;

      //const userId = user._id;
      // Render a template with the userId
      //res.render('home', { userId });

      //res.render('test', { title: 'My EJS Page' });



      res.redirect('/home');
    } else {
      res.status(401).json({ error: 'Invalid credentials' });
    }
  } catch (error) {
    console.error('Error during user login:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// User home page
app.get('/home', (req, res) => {
  const { name } = req.session;
  res.sendFile(__dirname + '/public/home.html');
});

// User registration
app.get('/register', (req, res) => {
  res.sendFile(__dirname + '/public/register.html');
});

app.post('/register', async (req, res) => {
  try {
    const { prn, name, email, password } = req.body;
    const existingUser = await User.findOne({ prn });

    if (existingUser) {
      return res.send('User with this PRN already exists.');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ prn, name, email, password: hashedPassword });
    await newUser.save();

    res.send('User registered successfully. You can now login.');
  } catch (error) {
    console.error('Error during user registration:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Librarian registration and login
app.get('/librarian/register', (req, res) => {
  res.sendFile(__dirname + '/public/librarian_register.html');
});

app.post('/librarian/register', async (req, res) => {
  try {
    const { email, password } = req.body;
    const existingLibrarian = await Librarian.findOne({ email });

    if (existingLibrarian) {
      return res.send('Librarian with this email already exists.');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newLibrarian = new Librarian({ email, password: hashedPassword });
    await newLibrarian.save();

    res.send('Librarian registered successfully. You can now login.');
  } catch (error) {
    console.error('Error during librarian registration:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/librarian/login', (req, res) => {
  res.sendFile(__dirname + '/public/librarian_login.html');
});

app.post('/librarian/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const librarian = await Librarian.findOne({ email });

    if (librarian && (await bcrypt.compare(password, librarian.password))) {
      req.session.librarianId = librarian._id;
      res.redirect('/librarian/home');
    } else {
      res.status(401).json({ error: 'Invalid credentials' });
    }
  } catch (error) {
    console.error('Error during librarian login:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Librarian home page
app.get('/librarian/home', requireLibrarianLogin, (req, res) => {
  res.sendFile(__dirname + '/public/librarianhome.html');
});

// Endpoint for adding a book (Librarian)
app.post('/librarian/addBook', requireLibrarianLogin, async (req, res) => {
  try {
    // Check if a librarian is logged in
    const { title, author, isbn } = req.body;

    // Use the librarianId from the session
    const librarianId = req.session.librarianId;

    // Validate input data
    if (!title || !author || !isbn) {
      return res.status(400).json({ error: 'Please provide title, author, and isbn for the book.' });
    }

    // Create a new book document
    const newBook = new Book({ title, author, isbn, librarian: librarianId });

    // Save the book to the database
    await newBook.save();

    res.json({ message: 'Book added successfully.' });
  } catch (error) {
    console.error('Error adding book:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Endpoint for updating a book (Librarian)
app.put('/librarian/updateBook/:bookId', requireLibrarianLogin, async (req, res) => {
  try {
    const { title, author, isbn } = req.body;
    const bookId = req.params.bookId;

    // Validate input data
    if (!title || !author || !isbn) {
      return res.status(400).json({ error: 'Please provide title, author, and isbn for the book.' });
    }

    // Find the book by ID and update its details
    await Book.findByIdAndUpdate(bookId, { title, author, isbn });

    res.json({ message: 'Book updated successfully.' });
  } catch (error) {
    console.error('Error updating book:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Endpoint for deleting a book request (Librarian)
app.delete('/librarian/deleteBookRequest/:bookId', requireLibrarianLogin, async (req, res) => {
  console.log('Inside deleteBookRequest');
  try {
    const bookId = req.params.bookId;

    // Fetch bookRequestIds by bookId
    const bookDeleteRes = await BookRequest.deleteMany({ book: bookId });
    console.log(bookDeleteRes);

    // Find the book by ID and delete it    
    //await BookRequest.findByIdAndDelete(bookRequestId);

    res.json({ message: 'Book Requests deleted successfully.' });
  } catch (error) {
    console.error('Error deleting book:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});
// Endpoint for deleting a book (Librarian)
app.delete('/librarian/deleteBook/:bookId', requireLibrarianLogin, async (req, res) => {
  console.log('Inside deleteBook');
  try {
    const bookId = req.params.bookId;

    // Find the book by ID and delete it  
    await Book.findByIdAndDelete(bookId);

    res.json({ message: 'Book deleted successfully.' });
  } catch (error) {
    console.error('Error deleting book:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});


// index.js

// Add the following endpoint to fetch books for availablebooks.html
app.get('/librarian/fetchBooks', requireLibrarianLogin, async (req, res) => {
  try {
    const librarianId = req.session.librarianId;
    const books = await Book.find({ librarian: librarianId });
    res.json(books);
  } catch (error) {
    console.error('Error fetching books:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});
// index.js

// ... (existing code)

// Endpoint for updating a book (Librarian)
app.put('/librarian/updateBook/:bookId', requireLibrarianLogin, async (req, res) => {
  try {
    const { title, author, isbn } = req.body;
    const bookId = req.params.bookId;

    // Validate input data
    if (!title || !author || !isbn) {
      return res.status(400).json({ error: 'Please provide title, author, and isbn for the book.' });
    }

    // Find the book by ID and update its details
    await Book.findByIdAndUpdate(bookId, { title, author, isbn });

    res.json({ message: 'Book updated successfully.' });
  } catch (error) {
    console.error('Error updating book:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Endpoint for deleting a book (Librarian)
app.delete('/librarian/deleteBook/:bookId', requireLibrarianLogin, async (req, res) => {
  try {
    const bookId = req.params.bookId;

    // Find the book by ID and delete it
    await Book.findByIdAndDelete(bookId);

    res.json({ message: 'Book deleted successfully.' });
  } catch (error) {
    console.error('Error deleting book:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Endpoint for searching books (Librarian)
app.get('/librarian/searchBooks', requireLibrarianLogin, async (req, res) => {
  try {
    const librarianId = req.session.librarianId;
    const searchTerm = req.query.search;

    // Use a regex for case-insensitive search
    const regex = new RegExp(searchTerm, 'i');

    const books = await Book.find({ librarian: librarianId, $or: [{ title: regex }, { author: regex }, { isbn: regex }] });
    res.json(books);
  } catch (error) {
    console.error('Error searching books:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});
// ... (existing code)

// Endpoint for fetching all students (Librarian)
app.get('/librarian/fetchStudents', requireLibrarianLogin, async (req, res) => {
  try {
    const students = await User.find();
    res.json(students);
  } catch (error) {
    console.error('Error fetching students:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Endpoint for fetching a specific user by ID (Librarian)
app.get('/librarian/fetchStudents/:userId', requireLibrarianLogin, async (req, res) => {
  try {
    const userId = req.params.userId;

    // Find the user by ID
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // Respond with the user information
    res.json({
      _id: user._id,
      name: user.name,
      prn: user.prn,
      email: user.email,
      // Add more fields as needed
    });
  } catch (error) {
    console.error('Error fetching user information:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});




app.get('/user/fetchStudents',  async (req, res) => {
  try {
    const userId = req.session.userId;
    console.log('user : ',userId);

    // Find the user by ID
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // Respond with the user information
    res.json({
      _id: user._id,
      name: user.name,
      prn: user.prn,
      email: user.email,
      // Add more fields as needed
    });
  } catch (error) {
    console.error('Error fetching user information:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Endpoint for fetching available books (Public)
app.get('/public/fetchAvailableBooks', async (req, res) => {
  try {
    // Fetch available books from the database
    const books = await Book.find();
    // alert(books);
    res.json(books);
  } catch (error) {
    console.error('Error fetching available books:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});
// index.js

// ... (existing code)

// Endpoint for searching books (Public)
app.get('/public/searchBooks', async (req, res) => {
  try {
    const searchTerm = req.query.search;

    // Use a regex for case-insensitive search
    const regex = new RegExp(searchTerm, 'i');

    const books = await Book.find({ $or: [{ title: regex }, { author: regex }, { isbn: regex }] });
    res.json(books);
  } catch (error) {
    console.error('Error searching books:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// index.js

// ... (existing code)
// ... (existing code)

// Create a new model for book requests
const BookRequest = mongoose.model('BookRequest', {
  book: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Book',
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  librarian: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Librarian',
  },
  status: {
    type: String,
    enum: ['Pending', 'Approved', 'Rejected','Issued','Returned'],
    default: 'Pending',
  },
});


// Endpoint for fetching book requests (Librarian)
app.get('/librarian/fetchBookRequests', async (req, res) => {
  try {
    const bookRequests = await BookRequest.find().populate('book user');

    // Map bookRequests to a new array with detailed information
    const detailedRequests = bookRequests.map(request => ({
      _id: request._id,
      status: request.status,
      book: {
        _id: request.book._id,
        title: request.book.title,
        author: request.book.author,
        isbn: request.book.isbn,
      },
      user: {
        _id: request.user._id,
        name: request.user.name,
        prn: request.user.prn,
        email: request.user.email,
      },
      librarian: request.librarian // You may want to populate this field if necessary
    }));

    res.json(detailedRequests);
  } catch (error) {
    console.error('Error fetching book requests:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/user/fetchMyBooks', async (req, res) => {
  try {
    const userId = req.session.userId;   
    console.log('Logged in User Id:', userId);

    // Assuming `book` and `user` are references in your schema
    const bookRequests = await BookRequest.find({ user: userId }).populate('book user');

    // Map bookRequests to a new array with detailed information
    const detailedRequests = bookRequests.map(request => ({
      _id: request._id,
      status: request.status,
      book: {
        _id: request.book._id,
        title: request.book.title,
        author: request.book.author,
        isbn: request.book.isbn,
      },
      user: {
        _id: request.user._id,
        name: request.user.name,
        prn: request.user.prn,
        email: request.user.email,
      },
      librarian: request.librarian // You may want to populate this field if necessary
    }));

    res.json(detailedRequests);
  } catch (error) {
    console.error('Error fetching book requests:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ... (existing code)

// Endpoint for requesting a book (User)
app.post('/user/requestBook/:bookId', async (req, res) => {
  try {
    const bookId = req.params.bookId;
    const userId = req.session.userId;
    const librarianId = req.body.librarianId; // You need to send librarianId from the client side

    // Check if the book request already exists
    const existingRequest = await BookRequest.findOne({ book: bookId, user: userId, status: 'Pending' });
    if (existingRequest) {
      return res.status(400).json({ error: 'You have already requested this book. Please wait for librarian approval.' });
    }

    // Create a new book request
    const newRequest = new BookRequest({
      book: bookId,
      user: userId,
      librarian: librarianId,
    });

    // Save the book request to the database
    await newRequest.save();

    res.json({ message: 'Book requested successfully.' });
  } catch (error) {
    console.error('Error requesting book:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});





// Endpoint for requesting a book (User)
app.post('/user/requestBook/:bookId', async (req, res) => {
  try {
    const bookId = req.params.bookId;
    const userId = req.session.userId;
    const { name, prn, email } = req.body;

    // Check if the book request already exists
    const existingRequest = await BookRequest.findOne({ book: bookId, user: userId, status: 'Pending' });
    if (existingRequest) {
      return res.status(400).json({ error: 'You have already requested this book. Please wait for librarian approval.' });
    }

    // Create a new book request
    const newRequest = new BookRequest({
      book: bookId,
      user: userId,
      name,
      prn,
      email,
    });

    // Save the book request to the database
    await newRequest.save();

    res.json({ message: 'Book requested successfully.' });
  } catch (error) {
    console.error('Error requesting book:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});



// ... (existing code)

// Endpoint for approving or rejecting a book request (Librarian)
app.post('/librarian/respondToBookRequest/:requestId', requireLibrarianLogin, async (req, res) => {
  try {
    const requestId = req.params.requestId;
    const responseStatus = req.body.status;

    // Validate input data
    if (!responseStatus || !['Approved', 'Rejected','Issued','Returned'].includes(responseStatus)) {
      return res.status(400).json({ error: 'Invalid request status. Please provide "Approved" or "Rejected".' });
    }

    // Find the book request by ID
    const bookRequest = await BookRequest.findById(requestId).populate('book user');
    if (!bookRequest) {
      return res.status(404).json({ error: 'Book request not found.' });
    }

    // Update the status of the book request
    bookRequest.status = responseStatus;
    await bookRequest.save();

    // You can add additional logic here, such as sending an email to the user

    res.json({ message: `Book request ${responseStatus.toLowerCase()} successfully.` });
  } catch (error) {
    console.error('Error responding to book request:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});








// Endpoint for requesting a book (User)
app.post('/user/requestBook/:bookId', async (req, res) => {
  try {
    const bookId = req.params.bookId;
    const userId = req.session.userId;
    const librarianId = req.body.librarianId; // You need to send librarianId from the client side

    // Check if the book request already exists
    const existingRequest = await BookRequest.findOne({ book: bookId, user: userId, status: 'Pending' });
    if (existingRequest) {
      return res.status(400).json({ error: 'You have already requested this book. Please wait for librarian approval.' });
    }

    // Create a new book request
    const newRequest = new BookRequest({
      book: bookId,
      user: userId,
      librarian: librarianId,
    });

    // Save the book request to the database
    await newRequest.save();

    res.json({ message: 'Book requested successfully.' });
  } catch (error) {
    console.error('Error requesting book:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Endpoint for requesting a book (User)
app.post('/user/requestBook/:bookId', async (req, res) => {
  try {
    const bookId = req.params.bookId;
    const userId = req.session.userId;

    // Check if the book request already exists
    const existingRequest = await BookRequest.findOne({ book: bookId, user: userId, status: 'Pending' });
    if (existingRequest) {
      return res.status(400).json({ error: 'You have already requested this book. Please wait for librarian approval.' });
    }

    // Create a new book request
    const newRequest = new BookRequest({
      book: bookId,
      user: userId,
    });

    // Save the book request to the database
    await newRequest.save();

    res.json({ message: 'Book requested successfully.' });
  } catch (error) {
    console.error('Error requesting book:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});








app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
