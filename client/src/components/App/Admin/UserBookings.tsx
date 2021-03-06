import React, { useContext, useState, useEffect, useCallback } from 'react';
import { RouteComponentProps, navigate } from '@reach/router';
import Paper from '@material-ui/core/Paper';
import format from 'date-fns/format';
import parse from 'date-fns/parse';

import { AppContext } from '../../AppProvider';

import AdminLayout from './Layout/Layout';
import Loading from '../../Assets/LoadingSpinner';

import { getUser, getBookings, cancelBooking } from '../../../lib/api';
import { formatError } from '../../../lib/app';
import { User, Booking } from '../../../types/api';

import { DATE_FNS_OPTIONS } from '../../../constants/dates';
import UserBookingsStyles from './UserBookings.styles';
import {
  TableContainer,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableSortLabel,
  TableBody,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
  useMediaQuery,
} from '@material-ui/core';
import { parseISO, isToday, isPast } from 'date-fns';
import { OurButton } from '../../../styles/MaterialComponents';
import useTheme from '@material-ui/core/styles/useTheme';

// Types
type SortOrder = 'asc' | 'desc';

// Helpers
const sortData = (data: Booking[], key: keyof Booking, order: SortOrder): Booking[] | undefined => {
  if (key === 'office') {
    return order === 'desc'
      ? data.sort((a, b) => b.office.name.localeCompare(a.office.name))
      : data.sort((a, b) => a.office.name.localeCompare(b.office.name));
  }

  if (key === 'parking') {
    return order === 'desc'
      ? data.sort((a, b) => Number(a.parking) - Number(b.parking))
      : data.sort((a, b) => Number(b.parking) - Number(a.parking));
  }

  if (key === 'date') {
    return order === 'desc'
      ? data.sort((a, b) => parseISO(a.date).valueOf() - parseISO(b.date).valueOf())
      : data.sort((a, b) => parseISO(b.date).valueOf() - parseISO(a.date).valueOf());
  }

  return data;
};

// Component
const UserBookings: React.FC<RouteComponentProps<{ email: string }>> = (props) => {
  // Global state
  const { state, dispatch } = useContext(AppContext);
  const { user } = state;

  // Local state
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<User | undefined>();
  const [bookings, setBookings] = useState<Booking[] | undefined>();
  const [bookingToCancel, setBookingToCancel] = useState<undefined | Booking>();
  const [sortedBookings, setSortedBookings] = useState<Booking[] | undefined>();

  const [sortBy, setSortBy] = useState<keyof Booking>('date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

  // Theme
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));

  // Effects
  useEffect(() => {
    if (props.email) {
      getBookings({ user: props.email })
        .then((data) => {
          // Split for previous and upcoming
          setBookings(data);
        })
        .catch((err) => {
          // Handle errors
          setLoading(false);

          dispatch({
            type: 'SET_ALERT',
            payload: {
              message: formatError(err),
              color: 'error',
            },
          });
        });
    }
  }, [props.email, dispatch]);

  useEffect(() => {
    if (user && !user.permissions.canViewUsers) {
      // No permissions - Bounce to home page
      navigate('/');
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      // Get selected user
      getUser(props.email || '')
        .then((selectedUser) => setSelectedUser(selectedUser))
        .catch((err) => {
          // Handle errors
          setLoading(false);

          dispatch({
            type: 'SET_ALERT',
            payload: {
              message: formatError(err),
              color: 'error',
            },
          });
        });
    }
  }, [user, props.email, dispatch]);

  useEffect(() => {
    if (bookings) {
      // Sort it!
      setSortedBookings(sortData([...bookings], sortBy, sortOrder));
    }
  }, [bookings, sortBy, sortOrder]);

  useEffect(() => {
    if (bookings) {
      // Wait for global state to be ready
      setLoading(false);
    }
  }, [bookings]);

  // Handlers
  const handleSort = (key: keyof Booking) => {
    if (key === sortBy) {
      setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBy(key);
    }
  };

  const getAllBookings = useCallback(() => {
    if (state.user) {
      getBookings({ user: state.user.email })
        .then((data) => {
          // Split for previous and upcoming
          setBookings(data);
        })
        .catch((err) => {
          // Handle errors
          setLoading(false);

          dispatch({
            type: 'SET_ALERT',
            payload: {
              message: formatError(err),
              color: 'error',
            },
          });
        });
    }
  }, [state.user, dispatch]);

  const handleCancelBooking = (booking: Booking) => {
    cancelBooking(booking.id, booking.user)
      .then(() => {
        // Clear selected booking
        setBookingToCancel(undefined);

        // Retrieve updated bookings
        getAllBookings();

        // Show confirmation alert
        dispatch({
          type: 'SET_ALERT',
          payload: {
            message: 'Booking cancelled',
            color: 'success',
          },
        });
      })
      .catch((err) =>
        dispatch({
          type: 'SET_ALERT',
          payload: {
            message: formatError(err),
            color: 'error',
          },
        })
      );
  };

  // Render
  if (!user) {
    return null;
  }

  return (
    <AdminLayout currentRoute="users">
      <UserBookingsStyles>
        {loading || !selectedUser ? (
          <Loading />
        ) : (
          <>
            <h3>User Bookings</h3>

            <Paper square className="table-container">
              <h4>{selectedUser.email}</h4>
              <TableContainer className="table">
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell className="table-header">
                        <TableSortLabel
                          active={sortBy === 'office'}
                          direction={sortOrder}
                          onClick={() => handleSort('office')}
                        >
                          Office
                        </TableSortLabel>
                      </TableCell>
                      <TableCell className="table-header">
                        <TableSortLabel
                          active={sortBy === 'date'}
                          direction={sortOrder}
                          onClick={() => handleSort('date')}
                        >
                          Date
                        </TableSortLabel>
                      </TableCell>
                      <TableCell className="table-header">
                        <TableSortLabel
                          active={sortBy === 'parking'}
                          direction={sortOrder}
                          onClick={() => handleSort('parking')}
                        >
                          Parking
                        </TableSortLabel>
                      </TableCell>
                      <TableCell />
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {sortedBookings && sortedBookings.length > 0 ? (
                      sortedBookings.map((booking, index) => {
                        const parsedDate = parseISO(booking.date);

                        return (
                          <TableRow key={index}>
                            <TableCell>{booking.office.name}</TableCell>
                            <TableCell>
                              {' '}
                              {format(
                                parse(booking.date, 'yyyy-MM-dd', new Date(), DATE_FNS_OPTIONS),
                                'do LLLL yyyy',
                                DATE_FNS_OPTIONS
                              )}
                            </TableCell>
                            <TableCell>{booking.parking ? 'Yes' : 'No'}</TableCell>
                            {isToday(parsedDate) || !isPast(parsedDate) ? (
                              <TableCell align="right">
                                <div className="btn-container">
                                  <OurButton
                                    type="submit"
                                    variant="contained"
                                    color="secondary"
                                    size="small"
                                    onClick={() => setBookingToCancel(booking)}
                                  >
                                    Cancel
                                  </OurButton>
                                </div>
                              </TableCell>
                            ) : (
                              <TableCell />
                            )}
                          </TableRow>
                        );
                      })
                    ) : (
                      <TableRow>
                        <TableCell>No bookings found</TableCell>
                        <TableCell />
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          </>
        )}

        {bookingToCancel && (
          <Dialog fullScreen={fullScreen} open={true} onClose={() => setBookingToCancel(undefined)}>
            <DialogTitle>{'Are you sure you want to cancel this booking?'}</DialogTitle>
            <DialogContent>
              <DialogContentText>
                Booking for <strong>{bookingToCancel.user}</strong> on{' '}
                <strong>{format(parseISO(bookingToCancel.date), 'do LLLL')}</strong> for{' '}
                <strong>{bookingToCancel.office.name}</strong>
              </DialogContentText>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setBookingToCancel(undefined)} color="primary" autoFocus>
                No
              </Button>
              <Button
                autoFocus
                onClick={() => handleCancelBooking(bookingToCancel)}
                color="primary"
              >
                Yes
              </Button>
            </DialogActions>
          </Dialog>
        )}
      </UserBookingsStyles>
    </AdminLayout>
  );
};

export default UserBookings;
